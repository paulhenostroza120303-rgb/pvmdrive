import express from 'express';
import multer from 'multer';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { auth } from './src/lib/firebase-admin';
import { uploadUserFile, buildFileDownloadResponse, getFileDoc } from './src/lib/storage-server';
import { decodeUploadFilename, contentDispositionHeader } from './src/lib/filename';
import { canAccessFile } from './src/lib/sharing';
import { db } from './src/lib/firebase-admin';

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

    // Obtener metadata del archivo para Content-Length
    const fileDoc = await getFileDoc(fileId);
    if (!fileDoc) return res.status(404).send('File not found');

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
