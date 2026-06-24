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
  to: string | string[];
  cc?: string[];
  bcc?: string[];
  replyTo?: string;
  subject: string;
  html: string;
  text?: string;
  attachments?: Array<{
    filename: string;
    contentType: string;
    contentBase64: string;
  }>;
};

type SmtpResponse = {
  code: number;
  message: string;
};

export type SmtpSendResult = {
  messageId: string;
};

const DEFAULT_SMTP_TIMEOUT_MS = 20_000;

function encodeBase64(value: string) {
  return Buffer.from(value, 'utf8').toString('base64');
}

function encodeSubject(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return '';
  const base64 = Buffer.from(trimmed, 'utf8').toString('base64');
  return `=?UTF-8?B?${base64}?=`;
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

function waitForResponse(socket: SocketLike, timeoutMs: number): Promise<SmtpResponse> {
  return new Promise((resolve, reject) => {
    let buffer = '';
    let timeout: NodeJS.Timeout | null = null;

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

    const handleTimeout = () => {
      cleanup();
      reject(new Error('SMTP timeout'));
    };

    const cleanup = () => {
      if (timeout) {
        clearTimeout(timeout);
        timeout = null;
      }
      socket.off('data', handleData);
      socket.off('error', handleError);
      socket.off('timeout', handleTimeout);
    };

    timeout = setTimeout(handleTimeout, Math.max(1000, timeoutMs));
    socket.on('data', handleData);
    socket.on('error', handleError);
    socket.on('timeout', handleTimeout);
  });
}

async function sendCommand(
  socket: SocketLike,
  command: string,
  expectedCodes: number[],
  timeoutMs: number
): Promise<SmtpResponse> {
  socket.write(`${command}\r\n`);
  const response = await waitForResponse(socket, timeoutMs);

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
  const messageId = `<${Date.now()}.${Math.random().toString(16).slice(2)}@${args.host}>`;
  const toList = Array.isArray(args.to) ? args.to : [args.to];
  const ccList = (args.cc || []).filter(Boolean);
  const hasAttachments = Boolean(args.attachments && args.attachments.length > 0);
  const boundaryMixed = `mixed_${Math.random().toString(16).slice(2)}`;
  const boundaryAlt = `alt_${Math.random().toString(16).slice(2)}`;
  const subject = encodeSubject(args.subject);

  const headers = [
    `From: ${args.from}`,
    `To: ${toList.join(', ')}`,
    ccList.length ? `Cc: ${ccList.join(', ')}` : '',
    args.replyTo ? `Reply-To: ${args.replyTo}` : '',
    `Subject: ${subject || args.subject}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: ${messageId}`,
    'MIME-Version: 1.0',
  ].filter(Boolean);

  const textPart = normalizeLines(args.text || '');
  const htmlPart = normalizeLines(args.html);

  const alternative = [
    `--${boundaryAlt}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    dotStuff(textPart || ' '),
    `--${boundaryAlt}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    dotStuff(htmlPart),
    `--${boundaryAlt}--`,
    '',
  ].join('\r\n');

  if (!hasAttachments) {
    headers.push(`Content-Type: multipart/alternative; boundary="${boundaryAlt}"`);
    return { messageId, data: `${headers.join('\r\n')}\r\n\r\n${alternative}\r\n.` };
  }

  const attachments = (args.attachments || []).map((att) => {
    const safeName = (att.filename || 'attachment').replace(/[\r\n"]/g, '').slice(0, 200);
    const safeType = (att.contentType || 'application/octet-stream').replace(/[\r\n"]/g, '').slice(0, 200);
    const base64Body = normalizeLines(att.contentBase64.replace(/\s+/g, ''));
    return [
      `--${boundaryMixed}`,
      `Content-Type: ${safeType}; name="${safeName}"`,
      'Content-Transfer-Encoding: base64',
      `Content-Disposition: attachment; filename="${safeName}"`,
      '',
      base64Body,
      '',
    ].join('\r\n');
  });

  headers.push(`Content-Type: multipart/mixed; boundary="${boundaryMixed}"`);

  const mixed = [
    `--${boundaryMixed}`,
    `Content-Type: multipart/alternative; boundary="${boundaryAlt}"`,
    '',
    alternative,
    ...attachments,
    `--${boundaryMixed}--`,
    '',
  ].join('\r\n');

  return { messageId, data: `${headers.join('\r\n')}\r\n\r\n${mixed}\r\n.` };
}

function normalizeRecipient(value: string) {
  return value.trim().replace(/[<>\r\n]/g, '');
}

function normalizeRecipients(value: string | string[] | null | undefined) {
  if (!value) return [];
  const list = Array.isArray(value) ? value : [value];
  return list.map(normalizeRecipient).filter(Boolean);
}

export async function sendSmtpEmailWithResult(args: SmtpSendArgs): Promise<SmtpSendResult> {
  const host = args.host.trim();
  const port = Number(args.port);
  const timeoutMs = DEFAULT_SMTP_TIMEOUT_MS;

  if (!host || !Number.isFinite(port)) {
    throw new Error('SMTP host and port are required.');
  }

  const secure = args.secure ?? port === 465;
  let socket: SocketLike | null = null;

  try {
    socket = secure
      ? await connectTlsSocket(host, port)
      : await connectPlainSocket(host, port);
    socket.setTimeout(timeoutMs);

    const banner = await waitForResponse(socket, timeoutMs);
    if (banner.code !== 220) {
      throw new Error(`SMTP connection failed: ${banner.message}`);
    }

    await sendCommand(socket, `EHLO ${host}`, [250], timeoutMs);

    if (!secure) {
      await sendCommand(socket, 'STARTTLS', [220], timeoutMs);
      socket = await connectTlsSocket(host, port, socket as net.Socket);
      socket.setTimeout(timeoutMs);
      await sendCommand(socket, `EHLO ${host}`, [250], timeoutMs);
    }

    await sendCommand(socket, 'AUTH LOGIN', [334], timeoutMs);
    await sendCommand(socket, encodeBase64(args.username), [334], timeoutMs);
    await sendCommand(socket, encodeBase64(args.password), [235], timeoutMs);
    const envelopeFrom = args.from.match(/<(.+?)>/)?.[1] || args.from;
    await sendCommand(socket, `MAIL FROM:<${normalizeRecipient(envelopeFrom)}>`, [250], timeoutMs);

    const toList = normalizeRecipients(args.to);
    const ccList = normalizeRecipients(args.cc);
    const bccList = normalizeRecipients(args.bcc);
    const recipients = Array.from(new Set([...toList, ...ccList, ...bccList]));
    if (recipients.length === 0) {
      throw new Error('SMTP recipients are required.');
    }

    for (const recipient of recipients) {
      await sendCommand(socket, `RCPT TO:<${recipient}>`, [250, 251], timeoutMs);
    }

    await sendCommand(socket, 'DATA', [354], timeoutMs);
    const message = buildHtmlMessage(args);
    socket.write(`${message.data}\r\n`);

    const completion = await waitForResponse(socket, timeoutMs);
    if (completion.code !== 250) {
      throw new Error(`SMTP delivery failed: ${completion.message}`);
    }

    await sendCommand(socket, 'QUIT', [221], timeoutMs);

    return { messageId: message.messageId };
  } finally {
    socket?.end();
    socket?.destroy();
  }
}

export async function sendSmtpEmail(args: {
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
}) {
  await sendSmtpEmailWithResult({
    host: args.host,
    port: args.port,
    secure: args.secure,
    username: args.username,
    password: args.password,
    from: args.from,
    to: args.to,
    replyTo: args.replyTo,
    subject: args.subject,
    html: args.html,
    text: '',
  });
}
