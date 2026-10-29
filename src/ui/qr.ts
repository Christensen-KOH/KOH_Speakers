import QRCode from 'qrcode';

/** The link students scan: opens the game and joins the room. */
export function joinUrl(code: string, origin = window.location.origin): string {
  return `${origin}${window.location.pathname}?room=${code}`;
}

/** High-contrast QR canvas for `url`, `size` px square. */
export function createQrCanvas(url: string, size: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.className = 'tk-qr';
  canvas.style.width = `${size}px`;
  canvas.style.height = `${size}px`;
  void QRCode.toCanvas(canvas, url, {
    width: size,
    margin: 2,
    errorCorrectionLevel: 'M',
    color: { dark: '#000000', light: '#ffffff' },
  });
  return canvas;
}

/** Full-screen QR + giant room code for the projector. Click or Esc closes. */
export function showQrModal(code: string): void {
  const overlay = document.createElement('div');
  overlay.className = 'tk-qr-modal';
  const card = document.createElement('div');
  card.className = 'tk-qr-card';
  const size = Math.round(Math.min(window.innerWidth, window.innerHeight) * 0.55);
  const label = document.createElement('div');
  label.className = 'tk-qr-label';
  label.textContent = 'Scan to join';
  const big = document.createElement('div');
  big.className = 'tk-qr-code';
  big.textContent = code;
  card.append(label, createQrCanvas(joinUrl(code), Math.max(220, size)), big);
  overlay.append(card);

  const close = (): void => {
    document.removeEventListener('keydown', onKey, true);
    overlay.remove();
  };
  const onKey = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      close();
    }
  };
  overlay.addEventListener('click', close);
  document.addEventListener('keydown', onKey, true);
  document.body.append(overlay);
}
