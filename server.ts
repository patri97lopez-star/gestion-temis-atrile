import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';
import { GoogleGenAI, Type } from '@google/genai';

interface FirebaseAppletConfig {
  projectId: string;
}

interface VerifiedFirebaseUser {
  uid: string;
  email: string;
  emailVerified: boolean;
}

interface AuthenticatedRequest extends Request {
  firebaseUser?: VerifiedFirebaseUser;
}

const rootDir = process.cwd();
const firebaseConfigPath = path.join(rootDir, 'firebase-applet-config.json');
const firebaseConfig: FirebaseAppletConfig = JSON.parse(
  fs.readFileSync(firebaseConfigPath, 'utf-8')
);

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '10mb' }));

let cachedCerts: Record<string, string> = {};
let certsExpiresAt = 0;

async function getFirebasePublicCerts(): Promise<Record<string, string>> {
  const now = Date.now();
  if (now < certsExpiresAt && Object.keys(cachedCerts).length > 0) {
    return cachedCerts;
  }
  const resp = await fetch(
    'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com'
  );
  if (!resp.ok) {
    throw new Error('No se pudieron obtener los certificados de verificación de Firebase.');
  }
  const cacheControl = resp.headers.get('cache-control') || '';
  const maxAgeMatch = cacheControl.match(/max-age=(\d+)/);
  const maxAgeSec = maxAgeMatch ? Number(maxAgeMatch[1]) : 3600;
  cachedCerts = (await resp.json()) as Record<string, string>;
  certsExpiresAt = now + maxAgeSec * 1000;
  return cachedCerts;
}

function decodeBase64Url(input: string): Buffer {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (normalized.length % 4)) % 4;
  return Buffer.from(normalized + '='.repeat(padLen), 'base64');
}

async function verifyFirebaseIdToken(idToken: string): Promise<VerifiedFirebaseUser> {
  const parts = idToken.split('.');
  if (parts.length !== 3) {
    throw new Error('Token de sesión con formato inválido.');
  }
  const [headerB64, payloadB64, signatureB64] = parts;
  const header = JSON.parse(decodeBase64Url(headerB64).toString('utf-8')) as {
    alg?: string;
    kid?: string;
  };
  const payload = JSON.parse(decodeBase64Url(payloadB64).toString('utf-8')) as {
    aud?: string;
    iss?: string;
    sub?: string;
    exp?: number;
    iat?: number;
    email?: string;
    email_verified?: boolean;
  };

  if (header.alg !== 'RS256' || !header.kid) {
    throw new Error('Algoritmo de firma no válido.');
  }

  const certs = await getFirebasePublicCerts();
  const cert = certs[header.kid];
  if (!cert) {
    throw new Error('Certificado de firma no encontrado.');
  }

  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(`${headerB64}.${payloadB64}`);
  verifier.end();
  const isValidSig = verifier.verify(cert, decodeBase64Url(signatureB64));
  if (!isValidSig) {
    throw new Error('Firma del token de sesión inválida.');
  }

  const nowSec = Math.floor(Date.now() / 1000);
  if (!payload.exp || payload.exp <= nowSec) {
    throw new Error('La sesión ha caducado. Vuelve a iniciar sesión.');
  }
  if (payload.aud !== firebaseConfig.projectId) {
    throw new Error('Audiencia del token no coincide con el proyecto.');
  }
  if (payload.iss !== `https://securetoken.google.com/${firebaseConfig.projectId}`) {
    throw new Error('Emisor del token no válido.');
  }
  if (!payload.sub || typeof payload.sub !== 'string') {
    throw new Error('Identificador de usuario ausente.');
  }
  if (!payload.email || payload.email_verified !== true) {
    throw new Error('El correo electrónico debe estar verificado.');
  }

  return {
    uid: payload.sub,
    email: payload.email,
    emailVerified: true,
  };
}

async function requireFirebaseAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization || '';
    if (!authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Autenticación requerida.' });
      return;
    }
    const token = authHeader.slice(7).trim();
    if (!token) {
      res.status(401).json({ error: 'Token de sesión vacío.' });
      return;
    }
    req.firebaseUser = await verifyFirebaseIdToken(token);
    next();
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Sesión no autorizada.';
    res.status(401).json({ error: message });
  }
}

function createGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('La clave de Gemini AI no está configurada en el servidor.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ ok: true, service: 'GESTION360' });
});

app.post('/api/ai/assistant', requireFirebaseAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const body = req.body as {
      question?: unknown;
      history?: Array<{ role: string; text: string }>;
      contextSnapshot?: Record<string, unknown>;
    };

    if (typeof body.question !== 'string' || body.question.trim().length === 0) {
      res.status(400).json({ error: 'Debes escribir una consulta válida.' });
      return;
    }
    if (body.question.length > 2000) {
      res.status(400).json({ error: 'La consulta supera el límite de 2.000 caracteres.' });
      return;
    }

    const ai = createGeminiClient();
    const safeSnapshot = JSON.stringify(body.contextSnapshot ?? {}).slice(0, 65000);
    const recentHistory = Array.isArray(body.history)
      ? body.history
          .slice(-6)
          .map((m) => `${m.role === 'user' ? 'Usuario' : 'Asistente'}: ${String(m.text).slice(0, 800)}`)
          .join('\n')
      : '';

    const systemInstruction = [
      'Eres el asistente financiero y operativo interno de GESTIÓN360.',
      'Responde siempre en español con tono profesional, preciso y claro.',
      'REGLA ESTRICTA: Utiliza EXCLUSIVAMENTE los datos autorizados incluidos en el bloque CONTEXTO_EMPRESA.',
      'No inventes cifras, clientes, facturas, fechas ni cálculos fuera del contexto proporcionado.',
      'Si el dato no existe en el contexto o está vacío, indícalo explícitamente.',
      'Recuerda al usuario cuando corresponda que los resúmenes contables y fiscales son orientativos y requieren revisión de su gestoría oficial; nunca ejecutes operaciones fiscales ni afirmes presentaciones oficiales.',
      'Formatea importes en euros (€) con precisión de dos decimales cuando proceda.',
    ].join(' ');

    const prompt = [
      `CONTEXTO_EMPRESA (JSON autorizado para ${req.firebaseUser?.email ?? 'usuario'}):`,
      safeSnapshot,
      recentHistory ? `\nHISTORIAL_RECIENTE:\n${recentHistory}` : '',
      `\nCONSULTA_ACTUAL:\n${body.question.trim()}`,
    ]
      .filter(Boolean)
      .join('\n');

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: prompt,
      config: {
        systemInstruction,
      },
    });

    res.json({
      answer: response.text ?? 'No se pudo generar una respuesta con los datos disponibles.',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error al consultar el asistente.';
    res.status(500).json({ error: message });
  }
});

app.post('/api/ai/ocr-invoice', requireFirebaseAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const body = req.body as {
      mimeType?: unknown;
      base64Data?: unknown;
      fileName?: unknown;
    };

    const allowedMimeTypes = new Set([
      'image/jpeg',
      'image/png',
      'image/webp',
      'application/pdf',
    ]);

    if (typeof body.mimeType !== 'string' || !allowedMimeTypes.has(body.mimeType)) {
      res.status(400).json({
        error: 'Formato no soportado para OCR. Usa PDF, JPG, PNG o WEBP.',
      });
      return;
    }

    if (typeof body.base64Data !== 'string' || body.base64Data.length < 20) {
      res.status(400).json({ error: 'Contenido de archivo inválido o vacío.' });
      return;
    }

    if (body.base64Data.length > 8_000_000) {
      res.status(400).json({ error: 'El archivo excede el tamaño máximo permitido para análisis OCR.' });
      return;
    }

    const ai = createGeminiClient();
    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: body.mimeType,
              data: body.base64Data,
            },
          },
          {
            text: [
              'Analiza esta factura o recibo de proveedor en España.',
              'Extrae únicamente los datos visibles con la máxima precisión para proponerlos al usuario antes de guardar.',
              'Si algún campo no es legible, deja cadena vacía o 0 según corresponda e indícalo en confidenceNotes.',
              'Para suggestedCategory elige exactamente una de: Alquiler, Suministros, Software y suscripciones, Publicidad, Material, Transporte, Telecomunicaciones, Servicios profesionales, Seguros, Nóminas, Otros.',
              'Para issueDate usa formato YYYY-MM-DD si aparece.',
            ].join(' '),
          },
        ],
      },
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            supplierName: { type: Type.STRING, description: 'Razón social o nombre del proveedor' },
            supplierTaxId: { type: Type.STRING, description: 'CIF o NIF del proveedor' },
            invoiceNumber: { type: Type.STRING, description: 'Número de factura' },
            issueDate: { type: Type.STRING, description: 'Fecha de emisión en formato YYYY-MM-DD' },
            concept: { type: Type.STRING, description: 'Resumen del concepto facturado' },
            taxBase: { type: Type.NUMBER, description: 'Base imponible en euros' },
            vatRate: { type: Type.NUMBER, description: 'Porcentaje de IVA aplicado (ej. 21, 10, 4, 0)' },
            vatAmount: { type: Type.NUMBER, description: 'Cuota de IVA soportado en euros' },
            total: { type: Type.NUMBER, description: 'Importe total factura en euros' },
            suggestedCategory: { type: Type.STRING, description: 'Categoría sugerida del gasto' },
            confidenceNotes: { type: Type.STRING, description: 'Observaciones sobre campos dudosos o verificación recomendada' },
          },
          required: [
            'supplierName',
            'supplierTaxId',
            'invoiceNumber',
            'issueDate',
            'concept',
            'taxBase',
            'vatRate',
            'vatAmount',
            'total',
            'suggestedCategory',
            'confidenceNotes',
          ],
        },
      },
    });

    const parsed = JSON.parse((response.text ?? '{}').trim());
    res.json({ proposal: parsed });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error al procesar la lectura OCR de la factura.';
    res.status(500).json({ error: message });
  }
});

async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.join(rootDir, 'dist');
    app.use(express.static(distDir));
    app.get('/{*splat}', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const port = 3000;
  app.listen(port, '0.0.0.0', () => {
    console.log(`GESTIÓN360 server listening on http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start GESTIÓN360 server:', err);
  process.exit(1);
});
