// server.js

// 1. Importar las librerías necesarias
const express = require('express');
const fs = require('fs').promises; // Usamos la versión de promesas para async/await
const path = require('path');
const cors = require('cors');

// 2. Configuración inicial
const app = express();
const PORT = 3000; // El puerto donde correrá nuestro servidor
const listsFilePath = path.join(__dirname, 'lists.json');
const logFilePath = path.join(__dirname, 'evaluations.log');

// 3. Middlewares (configuraciones intermedias)
app.use(cors()); // Habilita CORS para todas las rutas
app.use(express.json()); // Permite al servidor entender JSON que le envíen
app.use(express.static(__dirname)); // Sirve los archivos estáticos (index.html, script.js)

// 4. Definición de las rutas de la API

// --- API para las listas (blacklist/whitelist) ---

// GET /api/lists: Devuelve el contenido actual de lists.json
app.get('/api/lists', async (req, res) => {
  try {
    const data = await fs.readFile(listsFilePath, 'utf-8');
    res.json(JSON.parse(data));
  } catch (error) {
    console.error('Error reading lists file:', error);
    res.status(500).json({ message: 'Error reading lists file' });
  }
});

// POST /api/lists: Recibe nuevas listas y las guarda en lists.json
app.post('/api/lists', async (req, res) => {
  try {
    const newListData = req.body; // Los datos vienen en el cuerpo de la petición
    await fs.writeFile(listsFilePath, JSON.stringify(newListData, null, 2));
    res.json({ message: 'Lists updated successfully!' });
  } catch (error) {
    console.error('Error writing to lists file:', error);
    res.status(500).json({ message: 'Error writing to lists file' });
  }
});

// --- API para el log de evaluaciones ---

// POST /api/log: Recibe el resultado de una evaluación y lo guarda en el log
app.post('/api/log', async (req, res) => {
  try {
    const logEntry = req.body;
    const timestamp = new Date().toISOString();
    const logLine = `[${timestamp}] | TEXT: "${logEntry.text}" | IS_VALID: ${logEntry.result.isValid} | SCORE: ${logEntry.result.profanityScore} | CENSORED: "${logEntry.result.censoredText}"\n`;
    
    // 'a' significa "append" (añadir al final del archivo)
    await fs.appendFile(logFilePath, logLine); 
    res.json({ message: 'Log entry added successfully!' });
  } catch (error) {
    console.error('Error writing to log file:', error);
    res.status(500).json({ message: 'Error writing to log file' });
  }
});

// GET /api/log: Devuelve todo el reporte de evaluaciones
app.get('/api/log', async (req, res) => {
    try {
        const data = await fs.readFile(logFilePath, 'utf-8');
        res.type('text/plain').send(data);
    } catch (error) {
        // Si el archivo no existe, devuelve un string vacío.
        if (error.code === 'ENOENT') {
            return res.type('text/plain').send('No log entries yet.');
        }
        console.error('Error reading log file:', error);
        res.status(500).send('Error reading log file');
    }
});


// 5. Iniciar el servidor
app.listen(PORT, () => {
  console.log(`🚀 Server running at https://words-production-376a.up.railway.app:${PORT}`);
});