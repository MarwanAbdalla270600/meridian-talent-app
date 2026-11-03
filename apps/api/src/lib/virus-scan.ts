import { connect } from 'node:net';
import type { VirusScanStatus } from '@meridian/shared';

/** Virus-scan hook. Default: ClamAV (clamd INSTREAM) when configured, otherwise `skipped`. */
export interface VirusScanner {
  scan(bytes: Uint8Array): Promise<VirusScanStatus>;
}

export const noopScanner: VirusScanner = { scan: async () => 'skipped' };

export function createClamAvScanner(host: string, port: number, timeoutMs = 30_000): VirusScanner {
  return {
    scan: (bytes) =>
      new Promise<VirusScanStatus>((resolve) => {
        const socket = connect({ host, port });
        let response = '';
        const done = (s: VirusScanStatus) => {
          socket.destroy();
          resolve(s);
        };
        socket.setTimeout(timeoutMs, () => done('error'));
        socket.on('error', () => done('error'));
        socket.on('data', (d) => (response += d.toString()));
        socket.on('end', () => {
          if (/OK\0?$/.test(response.trim())) done('clean');
          else if (/FOUND/.test(response)) done('infected');
          else done('error');
        });
        socket.on('connect', () => {
          socket.write('zINSTREAM\0');
          const chunk = 64 * 1024;
          for (let i = 0; i < bytes.length; i += chunk) {
            const part = bytes.subarray(i, i + chunk);
            const len = Buffer.alloc(4);
            len.writeUInt32BE(part.length);
            socket.write(len);
            socket.write(part);
          }
          socket.write(Buffer.alloc(4));
        });
      }),
  };
}
