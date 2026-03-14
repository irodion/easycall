import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { compressImage } from './compressImage';

describe('compressImage', () => {
  let mockCanvas: { toBlob: ReturnType<typeof vi.fn>; getContext: ReturnType<typeof vi.fn> };
  let mockContext: { drawImage: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockContext = { drawImage: vi.fn() };
    mockCanvas = {
      toBlob: vi.fn(),
      getContext: vi.fn().mockReturnValue(mockContext),
    };

    // Capture the original before spying to avoid infinite recursion in the else branch
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'canvas') return mockCanvas as unknown as HTMLCanvasElement;
      return originalCreateElement(tag);
    });

    // Mock Image loading
    vi.stubGlobal(
      'Image',
      class {
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        width = 400;
        height = 300;
        _src = '';
        set src(value: string) {
          this._src = value;
          // Trigger onload asynchronously
          setTimeout(() => this.onload?.(), 0);
        }
        get src() {
          return this._src;
        }
      },
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('calls toBlob with image/jpeg', async () => {
    const mockBlob = new Blob(['data'], { type: 'image/jpeg' });
    mockCanvas.toBlob.mockImplementation((cb: (b: Blob) => void) => cb(mockBlob));

    const file = new File(['data'], 'photo.jpg', { type: 'image/jpeg' });
    const result = await compressImage(file);

    expect(mockCanvas.toBlob).toHaveBeenCalledWith(
      expect.any(Function),
      'image/jpeg',
      expect.any(Number),
    );
    expect(result).toBeInstanceOf(Blob);
  });

  it('returns a blob with image/jpeg type', async () => {
    const mockBlob = new Blob(['data'], { type: 'image/jpeg' });
    mockCanvas.toBlob.mockImplementation((cb: (b: Blob) => void) => cb(mockBlob));

    const file = new File(['data'], 'photo.jpg', { type: 'image/jpeg' });
    const result = await compressImage(file);

    expect(result.type).toBe('image/jpeg');
  });

  it('calls drawImage on the canvas context', async () => {
    const mockBlob = new Blob(['data'], { type: 'image/jpeg' });
    mockCanvas.toBlob.mockImplementation((cb: (b: Blob) => void) => cb(mockBlob));

    const file = new File(['data'], 'photo.jpg', { type: 'image/jpeg' });
    await compressImage(file);

    expect(mockContext.drawImage).toHaveBeenCalled();
  });

  it('rejects when canvas.getContext returns null', async () => {
    mockCanvas.getContext.mockReturnValue(null);

    const file = new File(['data'], 'photo.jpg', { type: 'image/jpeg' });
    await expect(compressImage(file)).rejects.toThrow('Canvas 2D context not available');
  });

  it('rejects when canvas.toBlob calls back with null', async () => {
    mockCanvas.toBlob.mockImplementation((cb: (b: Blob | null) => void) => cb(null));

    const file = new File(['data'], 'photo.jpg', { type: 'image/jpeg' });
    await expect(compressImage(file)).rejects.toThrow('Failed to compress image');
  });

  it('rejects when image fails to load', async () => {
    // Override the Image stub to trigger onerror instead of onload
    vi.stubGlobal(
      'Image',
      class {
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        width = 400;
        height = 300;
        _src = '';
        set src(value: string) {
          this._src = value;
          setTimeout(() => this.onerror?.(), 0);
        }
        get src() {
          return this._src;
        }
      },
    );

    const file = new File(['data'], 'photo.jpg', { type: 'image/jpeg' });
    await expect(compressImage(file)).rejects.toThrow('Failed to load image');
  });
});
