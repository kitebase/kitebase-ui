import { describe, expect, it } from 'vitest';
import { registerViewer, viewerOf } from './viewers';
import { entryOf } from '../../api/fileSource';

describe('viewerOf', () => {
  it('opens an image over the page, a PDF in a tab, the rest as a download', () => {
    expect(viewerOf({ kind: 'image/png' }).mode).toBe('overlay');
    expect(viewerOf({ kind: 'application/pdf' }).mode).toBe('tab');
    expect(viewerOf({ kind: 'text/plain' }).mode).toBe('tab');
    expect(viewerOf({ kind: 'application/zip' }).icon).toBe('archive');
    expect(viewerOf({ kind: 'application/octet-stream' })).toMatchObject({ mode: 'download', icon: 'file' });
  });

  it('lets a registered viewer take a kind first, one that is not a MIME type too', () => {
    registerViewer({ accepts: (k) => k === 'link', mode: 'tab', icon: 'file' });
    registerViewer({ accepts: (k) => k === 'application/pdf', mode: 'download', icon: 'pdf' });
    expect(viewerOf({ kind: 'link' }).mode).toBe('tab');
    expect(viewerOf({ kind: 'application/pdf' }).mode).toBe('download');
  });
});

describe('entryOf', () => {
  it('keys a file of a folder by its name and keeps its thumb', () => {
    const entry = entryOf({ name: 'a.jpg', size: 3, mime: 'image/jpeg', modified: 1,
                            description: 'Front', url: 'media/x', thumb: 'media/x?v=thumb' });
    expect(entry).toMatchObject({ key: 'a.jpg', name: 'a.jpg', kind: 'image/jpeg', thumb: 'media/x?v=thumb' });
  });
});
