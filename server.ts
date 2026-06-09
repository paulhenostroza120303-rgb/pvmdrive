import express from 'express';
import multer from 'multer';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { Readable } from 'stream';
import { auth } from './src/lib/firebase-admin';
import { uploadUserFile } from './src/lib/storage-server';
import { getFileUrl } from './src/lib/telegram-server';

const app = express();
app.use(cors({
  origin: '*', 
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

const upload = multer({ 
  dest: 'uploads/',
  limits: { fileSize: 2 * 1024 * 1024 * 1024 } 
});

// Endpoint de Salud
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Upload server is alive!' });
});

// Endpoint de Descarga Unificada (Ensambla los trozos de Telegram)
app.get('/download/:fileId', async (req, res) => {
  try {
    const { fileId } = req.params;
    const admin = require('firebase-admin');
    const db = admin.firestore();
    
    const fileDoc = await db.collection('files').doc(fileId).get();
    if (!fileDoc.exists) return res.status(404).send('File not found');
    
    const fileData = fileDoc.data();
    const chunksSnap = await db.collection('file_chunks')
      .where('fileId', '==', fileId)
      .orderBy('index', 'asc')
      .get();

    res.setHeader('Content-Disposition', `attachment; filename="${fileData.name}"`);
    res.setHeader('Content-Type', fileData.mimeType || 'application/octet-stream');

    if (chunksSnap.empty) {
      // Archivo simple
      const url = await getFileUrl(fileData.telegramFileId);
      const response = await fetch(url);
      const reader = response.body?.getReader();
      if (!reader) return res.status(500).send('Error reading file stream');
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
      }
      res.end();
      return;
    }

    // Archivo fragmentado: Unir fragmentos en un stream
    for (const chunkDoc of chunksSnap.docs) {
      const chunkData = chunkDoc.data();
      const chunkUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${chunkData.telegramFilePath}`;
      const response = await fetch(chunkUrl);
      const reader = response.body?.getReader();
      if (!reader) continue;
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
      }
    }
    res.end();
  } catch (error) {
    console.error('Download Error:', error);
    res.status(500).send('Internal Server Error');
  }
});

// Endpoint de Subida
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

    const fileBuffer = fs.readFileSync(file.path);
    const result = await uploadUserFile(userId, fileBuffer, file.originalname, file.mimetype, folderId);
    
    fs.unlinkSync(file.path);
    res.json(result);
  } catch (error: any) {
    console.error("Upload Error:", error);
    res.status(500).json({ error: error.message || 'Internal Server Error' });
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
