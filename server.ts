import express from 'express';
import multer from 'multer';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { ZipArchive } from 'archiver';
import { auth } from './src/lib/firebase-admin';
import { uploadUserFile, buildFileDownloadResponse, getFileDoc } from './src/lib/storage-server';
import { decodeUploadFilename, contentDispositionHeader } from './src/lib/filename';
import { canAccessFile, canAccessFolder, getFolderDoc } from './src/lib/sharing';
import { db } from './src/lib/firebase-admin';
import { resolveFilePath } from './src/lib/telegram-server';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';

function telegramFileUrl(filePath: string) {
  return `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${filePath}`;
}

// Función recursiva para listar todos los archivos de una carpeta
async function listFolderFilesRecursive(folderId: string): Promise<Array<{ id: string; name: string; path: string }>> {
  const files: Array<{ id: string; name: string; path: string }> = [];
  
  // Obtener archivos en esta carpeta
  const filesQuery = db.collection('files').where('folderId', '==', folderId).where('trashed', '==', false);
  const filesSnap = await filesQuery.get();
  
  filesSnap.docs.forEach(doc => {
    const data = doc.data();
    files.push({
      id: doc.id,
      name: data.name || 'archivo',
      path: data.name || 'archivo'
    });
  });
  
  // Obtener subcarpetas
  const foldersQuery = db.collection('folders').where('parentId', '==', folderId).where('trashed', '==', false);
  const foldersSnap = await foldersQuery.get();
  
  for (const folderDoc of foldersSnap.docs) {
    const folderData = folderDoc.data();
    const folderName = folderData.name || 'carpeta';
    
    // Recursivamente obtener archivos de subcarpeta
    const subFiles = await listFolderFilesRecursive(folderDoc.id);
    subFiles.forEach(sf => {
      files.push({
        id: sf.id,
        name: sf.name,
        path: `${folderName}/${sf.path}`
      });
    });
  }
  
  return files;
}

const uploadsDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const app = express();

// CORS abierto - la seguridad se maneja con verificación de token Firebase en cada endpoint
app.use(cors({
  origin: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

const upload = multer({
  dest: uploadsDir,
  limits: { fileSize: 2 * 1024 * 1024 * 1024 }
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Upload server is alive!' });
});

app.get('/download/:fileId', async (req, res) => {
  try {
    const { fileId } = req.params;
    const isPublic = req.query.public === 'true';

    // Si es descarga pública, verificar que el archivo tenga shareToken
    if (!isPublic) {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const token = authHeader.split('Bearer ')[1];
      const decodedToken = await auth.verifyIdToken(token);
      const userId = decodedToken.uid;
      const userEmail = decodedToken.email || '';

      const allowed = await canAccessFile(userId, userEmail, fileId, 'view');
      if (!allowed) {
        return res.status(403).json({ error: 'Forbidden' });
      }
    } else {
      // Verificar que el archivo sea público (tenga shareToken)
      const fileDoc = await getFileDoc(fileId);
      if (!fileDoc || !fileDoc.shareToken) {
        return res.status(403).json({ error: 'Forbidden' });
      }
    }

    // Obtener metadata del archivo
    const fileDoc = await getFileDoc(fileId);
    if (!fileDoc) return res.status(404).send('File not found');

    // OPTIMIZACIÓN: Archivos bot (≤20MB) van directo desde Telegram CDN
    if (fileDoc.storageMethod === 'bot' && fileDoc.telegramFilePath) {
      const telegramUrl = telegramFileUrl(fileDoc.telegramFilePath);
      return res.redirect(telegramUrl);
    }

    // Archivos gramjs/chunked necesitan proxy (no tienen URL pública)
    const download = await buildFileDownloadResponse(fileId);
    if (!download) return res.status(404).send('File not found');

    res.setHeader('Content-Disposition', contentDispositionHeader(download.fileName));
    res.setHeader('Content-Type', download.mimeType);
    // Content-Length para que el navegador muestre progreso de descarga
    if (fileDoc.size) res.setHeader('Content-Length', fileDoc.size);

    const reader = download.stream.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
    }
    res.end();
  } catch (error) {
    console.error('Download Error:', error);
    if (!res.headersSent) {
      res.status(500).send('Internal Server Error');
    } else {
      res.end();
    }
  }
});

app.get('/download-folder/:folderId', async (req, res) => {
  try {
    const { folderId } = req.params;
    const authHeader = req.headers.authorization;
    
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await auth.verifyIdToken(token);
    const userId = decodedToken.uid;
    const userEmail = decodedToken.email || '';

    // Verificar acceso a la carpeta
    const hasAccess = await canAccessFolder(userId, userEmail, folderId);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    // Obtener nombre de la carpeta
    const folderDoc = await getFolderDoc(folderId);
    if (!folderDoc) {
      return res.status(404).send('Folder not found');
    }
    const folderName = folderDoc.name || 'carpeta';

    // Listar todos los archivos recursivamente
    const files = await listFolderFilesRecursive(folderId);
    
    if (files.length === 0) {
      return res.status(404).send('Folder is empty');
    }

    // Configurar respuesta ZIP
    const zipFileName = `${folderName}.zip`;
    res.setHeader('Content-Disposition', contentDispositionHeader(zipFileName));
    res.setHeader('Content-Type', 'application/zip');

    // Crear archivo ZIP en streaming
    const archive = new ZipArchive({
      zlib: { level: 6 } // Nivel de compresión balanceado
    });

    archive.on('error', (err: Error) => {
      console.error('ZIP archive error:', err);
      if (!res.headersSent) {
        res.status(500).send('Error creating ZIP');
      }
    });

    archive.pipe(res);

    // Descargar y agregar cada archivo al ZIP
    let processedCount = 0;
    const totalCount = files.length;

    for (const file of files) {
      try {
        // Obtener la descarga del archivo
        const download = await buildFileDownloadResponse(file.id);
        if (!download) {
          console.warn(`File ${file.id} not found, skipping`);
          processedCount++;
          continue;
        }

        // Crear un buffer para el archivo
        const chunks: Buffer[] = [];
        const reader = download.stream.getReader();
        
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(Buffer.from(value));
        }

        const fileBuffer = Buffer.concat(chunks);
        
        // Agregar al ZIP con la ruta correcta
        archive.append(fileBuffer, { name: file.path });
        
        processedCount++;
        console.log(`[ZIP] Progreso: ${processedCount}/${totalCount} - ${file.path}`);
      } catch (error) {
        console.error(`Error processing file ${file.name}:`, error);
        processedCount++;
      }
    }

    // Finalizar el archivo ZIP
    await archive.finalize();
    console.log(`[ZIP] Completado: ${zipFileName} (${processedCount} archivos)`);
  } catch (error) {
    console.error('Download Folder Error:', error);
    if (!res.headersSent) {
      res.status(500).send('Internal Server Error');
    } else {
      res.end();
    }
  }
});

app.post('/upload', upload.single('file'), async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await auth.verifyIdToken(token);
    const userId = decodedToken.uid;

    const file = req.file;
    const folderId = req.body.folderId || null;

    if (!file) return res.status(400).json({ error: 'No file uploaded' });

    const rawName = req.body.fileName || file.originalname;
    const fileName = decodeUploadFilename(rawName);
    const fileBuffer = fs.readFileSync(file.path);
    const result = await uploadUserFile(userId, fileBuffer, fileName, file.mimetype, folderId);

    if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
    res.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    console.error("Upload Error:", error);
    res.status(500).json({ error: message });
  }
});

const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

app.listen(Number(PORT), HOST, () => {
  console.log(`🚀 Upload server is officially ONLINE`);
  console.log(`📡 Listening on http://${HOST}:${PORT}`);
});

process.on('uncaughtException', (err) => {
  console.error('❌ UNCAUGHT EXCEPTION:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('⚠️ UNHANDLED REJECTION at:', promise, 'reason:', reason);
});
