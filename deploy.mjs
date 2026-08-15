/**
 * Deploy del frontend al hosting web (InfinityFree / ftpupload.net).
 *
 * Uso:
 *   1. Configura tus credenciales en `.env.deploy` (ver `.env.deploy.example`).
 *   2. Ejecuta `npm run build` para generar la carpeta `dist/`.
 *   3. Ejecuta `node deploy.mjs`.
 *
 * El script vacía por completo el directorio remoto y sube el contenido
 * de `dist/` (index.html + carpeta assets/).
 */
import ftp from 'basic-ftp';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), '.env.deploy') });

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const HOST = process.env.DEPLOY_HOST || 'ftpupload.net';
const PORT = Number(process.env.DEPLOY_PORT || 21);
const USER = process.env.DEPLOY_USER;
const PASS = process.env.DEPLOY_PASS;
const DIST_DIR = path.join(__dirname, 'dist');
const REMOTE_DIR = process.env.DEPLOY_DIR || 'htdocs';

if (!USER || !PASS) {
  console.error('❌ Faltan DEPLOY_USER o DEPLOY_PASS.');
  console.error('   Crea el archivo .env.deploy copiando .env.deploy.example y rellena tus credenciales.');
  process.exit(1);
}

if (!fs.existsSync(DIST_DIR)) {
  console.error(`❌ No existe la carpeta ${DIST_DIR}. Ejecuta primero: npm run build`);
  process.exit(1);
}

const client = new ftp.Client(30000);
client.ftp.verbose = false;

async function run() {
  try {
    // Intentar primero FTP en claro; si el servidor lo exige, usar TLS explícito.
    try {
      await client.access({ host: HOST, port: PORT, user: USER, password: PASS, secure: false });
    } catch (err) {
      console.log('🔒 FTP en claro falló, reintentando con TLS explícito...');
      await client.access({ host: HOST, port: PORT, user: USER, password: PASS, secure: true });
    }
    console.log(`🔌 Conectado a ${HOST}:${PORT}`);

    // 1. Ir a la raíz y crear/entrar al web root.
    await client.cd('/');
    await client.ensureDir(REMOTE_DIR);
    console.log(`📁 Directorio remoto: ${REMOTE_DIR}/`);

    // 2. Vaciar SOLO el contenido del web root.
    const remoto = await client.list('.');
    for (const item of remoto) {
      if (item.isDirectory) {
        await client.removeDir(item.name);
        console.log(`🗑️  Dir eliminado: ${item.name}/`);
      } else {
        await client.remove(item.name);
        console.log(`🗑️  Archivo eliminado: ${item.name}`);
      }
    }

    // 3. Subir todo el contenido de dist/ (index.html + assets/).
    await client.uploadFromDir(DIST_DIR, '.');
    console.log('🚀 Contenido de dist/ subido correctamente.');

    // 4. Verificar.
    const remotoFinal = await client.list('.');
    console.log(`📋 Contenido remoto: ${remotoFinal.map((i) => i.name).join(', ')}`);
  } catch (err) {
    console.error('❌ Error durante el despliegue:', err.message);
    process.exitCode = 1;
  } finally {
    client.close();
  }
}

run();
