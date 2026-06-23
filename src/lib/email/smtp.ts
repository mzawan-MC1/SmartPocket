import 'server-only';

import net from 'node:net';
import tls from 'node:tls';

type SocketLike = net.Socket | tls.TLSSocket;

type SmtpSendArgs = {
  host: string;
  port: number;
  secure?: boolean;
  username: string;
  password: string;
  from: string;
  to: string;
  replyTo?: string;
  subject: string;
  html: string;
};

type SmtpResponse = {
  code: number;
  message: string;
};

function encodeBase64(value: string) {
  return Buffer.from(value, 'utf8').toString('base64');
}

function normalizeLines(value: string) {
  return value.replace(/\r?\n/g, '\r\n');
}

function dotStuff(value: string) {
  return value
    .split('\r\n')
    .map((line) => (line.startsWith('.') ? `.${line}` : line))
    .join('\r\n');
}

function waitForResponse(socket: SocketLike): Promise<SmtpResponse> {
  return new Promise((resolve, reject) => {
    let buffer = '';

    const handleData = (chunk: Buffer | string) => {
      buffer += chunk.toString();
      const lines = buffer.replace(/\r/g, '').split('\n').filter(Boolean);
      const lastLine = lines[lines.length - 1];

      if (!lastLine || !/^\d{3}[ -]/.test(lastLine)) {
        return;
      }

      if (/^\d{3} /.test(lastLine)) {
        cleanup();
        resolve({
          code: Number(lastLine.slice(0, 3)),
          message: lines.join('\n'),
        });
      }
    };

    const handleError = (error: Error) => {
      cleanup();
      reject(error);
    };

    const cleanup = () => {
      socket.off('data', handleData);
      socket.off('error', handleError);
    };

    socket.on('data', handleData);
    socket.on('error', handleError);
  });
}

async function sendCommand(
  socket: SocketLike,
  command: string,
  expectedCodes: number[]
): Promise<SmtpResponse> {
  socket.write(`${command}\r\n`);
  const response = await waitForResponse(socket);

  if (!expectedCodes.includes(response.code)) {
    throw new Error(`SMTP command failed (${command.split(' ')[0]}): ${response.message}`);
  }

  return response;
}

function connectPlainSocket(host: string, port: number) {
  return new Promise<net.Socket>((resolve, reject) => {
    const socket = net.createConnection({ host, port }, () => resolve(socket));
    socket.once('error', reject);
  });
}

function connectTlsSocket(host: string, port: number, socket?: net.Socket) {
  return new Promise<tls.TLSSocket>((resolve, reject) => {
    const secureSocket = tls.connect(
      {
        host,
        port,
        socket,
        servername: host,
      },
      () => resolve(secureSocket)
    );
    secureSocket.once('error', reject);
  });
}

function buildHtmlMessage(args: SmtpSendArgs) {
  const headers = [
    `From: ${args.from}`,
    `To: ${args.to}`,
    args.replyTo ? `Reply-To: ${args.replyTo}` : '',
    `Subject: ${args.subject}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${Date.now()}.${Math.random().toString(16).slice(2)}@${args.host}>`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
  ].filter(Boolean);

  return `${headers.join('\r\n')}\r\n\r\n${dotStuff(normalizeLines(args.html))}\r\n.`;
}

export async function sendSmtpEmail(args: SmtpSendArgs) {
  const host = args.host.trim();
  const port = Number(args.port);

  if (!host || !Number.isFinite(port)) {
    throw new Error('SMTP host and port are required.');
  }

  const secure = args.secure ?? port === 465;
  let socket: SocketLike | null = null;

  try {
    socket = secure
      ? await connectTlsSocket(host, port)
      : await connectPlainSocket(host, port);

    const banner = await waitForResponse(socket);
    if (banner.code !== 220) {
      throw new Error(`SMTP connection failed: ${banner.message}`);
    }

    await sendCommand(socket, `EHLO ${host}`, [250]);

    if (!secure) {
      await sendCommand(socket, 'STARTTLS', [220]);
      socket = await connectTlsSocket(host, port, socket as net.Socket);
      await sendCommand(socket, `EHLO ${host}`, [250]);
    }

    await sendCommand(socket, 'AUTH LOGIN', [334]);
    await sendCommand(socket, encodeBase64(args.username), [334]);
    await sendCommand(socket, encodeBase64(args.password), [235]);
    await sendCommand(socket, `MAIL FROM:<${args.from.match(/<(.+?)>/)?.[1] || args.from}>`, [250]);
    await sendCommand(socket, `RCPT TO:<${args.to}>`, [250, 251]);
    await sendCommand(socket, 'DATA', [354]);
    socket.write(`${buildHtmlMessage(args)}\r\n`);

    const completion = await waitForResponse(socket);
    if (completion.code !== 250) {
      throw new Error(`SMTP delivery failed: ${completion.message}`);
    }

    await sendCommand(socket, 'QUIT', [221]);
  } finally {
    socket?.end();
    socket?.destroy();
  }
}
