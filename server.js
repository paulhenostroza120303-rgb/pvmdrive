const express = require('express');
const multer = require('multer');
const cors = require('cors');
const { App } = require('firebase-admin');
const { uploadFile } = require('./src/lib/telegram-server'); // Adaptado para CommonJS

const app = express();
app.use(cors());
app.use(express.json());

// Configuración de Multer para manejar archivos en memoria
const upload = multer({ storage: multer.memoryStorage() });

// Inicialización de Firebase Admin
const admin = require('firebase-admin');
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}
const db = admin.firestore();
const auth = admin.auth();

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

    // Usamos la misma lógica de storage-server que ya escribimos
    // Nota: Tendremos que adaptar storage-server para que sea compatible con CommonJS o usar un bundle
    const result = await uploadUserFile(userId, file.buffer, file.originalname, file.mimetype, folderId);
    
    res.json(result);
  } catch (error) {
    console.error("Upload Error:", error);
    res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Upload server running on port ${PORT}`));

// Mock de uploadUserFile para que el ejemplo sea autónomo o importarlo correctamente
async function uploadUserFile(userId, buffer, fileName, mimeType, folderId) {
    // Aquí llamaríamos a la lógica de telegram-server.ts
    // Para simplificar la migración, moveré la lógica a un archivo compartido.
}
