import express from 'express';
import multer from 'multer';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { auth } from './src/lib/firebase-admin';
import { uploadUserFile } from './src/lib/storage-server';

const app = express();
app.use(cors({
  origin: '*', 
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// Endpoint de salud para probar conexión
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Upload server is alive!' });
});

// Configuración de Multer para usar disco en lugar de memoria (Evita crashes con archivos GB)
const upload = multer({ 
  dest: 'uploads/',
  limits: { fileSize: 2 * 1024 * 1024 * 1024 } // Límite de 2GB
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

    // Leer el archivo desde el disco en lugar de la memoria
    const fileBuffer = fs.readFileSync(file.path);
    
    const result = await uploadUserFile(userId, fileBuffer, file.originalname, file.mimetype, folderId);
    
    // Borrar el archivo temporal del disco después de subirlo
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

// Capturar errores globales para que el servidor no se cierre sin avisar
process.on('uncaughtException', (err) => {
  console.error('❌ UNCAUGHT EXCEPTION:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('⚠️ UNHANDLED REJECTION at:', promise, 'reason:', reason);
});
