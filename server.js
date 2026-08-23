const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const { Pool } = require('pg'); // 👈 Importar Postgres

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

// Configuración de la conexión a PostgreSQL (por defecto Postgres.app usa tu usuario de Mac)
const pool = new Pool({
  user: process.env.USER, // Tu usuario actual de la Mac
  host: 'localhost',
  database: 'monitorgps_db',
  password: '', // Postgres.app por defecto no pide contraseña en local
  port: 5432,
});

// Ruta para obtener el historial de ubicaciones de un usuario
app.get('/api/historial/:usuario', async (req, res) => {
  const { usuario } = req.params;
  try {
    const query = `
      SELECT latitud, longitud, fecha 
      FROM ubicaciones 
      WHERE usuario = $1 
      ORDER BY fecha ASC 
      LIMIT 100
    `;
    const resultado = await pool.query(query, [usuario]);
    res.json(resultado.rows); // Devuelve los puntos en formato JSON
  } catch (error) {
    console.error('Error al obtener el historial:', error.message);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

io.on('connection', (socket) => {
  console.log(`Nuevo cliente conectado: ${socket.id}`);

  socket.on('enviarUbicacion', async (datos) => {
    console.log('Ubicación recibida:', datos);
    
    try {
      // Guardar en PostgreSQL forzando los parámetros a ::numeric para evitar conflictos de tipos
      const query = `
        INSERT INTO ubicaciones (usuario, latitud, longitud, geom) 
        VALUES ($1, $2::numeric, $3::numeric, ST_SetSRID(ST_MakePoint($3::numeric, $2::numeric), 4326))
      `;
      await pool.query(query, [datos.usuario, datos.latitud, datos.longitud]);
      console.log('💾 Ubicación guardada en PostgreSQL');
    } catch (error) {
      console.error('❌ Detalle del error en Postgres:', error.message);
    }

    // Reenviar al mapa en tiempo real
    socket.broadcast.emit('ubicacionActualizada', datos);
  });

  socket.on('disconnect', () => {
    console.log(`Cliente desconectado: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Servidor corriendo en el puerto ${PORT}`);
});