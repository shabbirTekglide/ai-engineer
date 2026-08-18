// // SyllabusViewer.jsx
// import React, { useEffect, useState } from 'react';
// import PropTypes from 'prop-types';

// function toGView(url) {
//   return `https://docs.google.com/gview?embedded=1&url=${encodeURIComponent(url)}`;
// }

// // Simple magic-byte sniffers
// function isPdfMagic(buf) {
//   const head = new Uint8Array(buf.slice(0, 5));
//   // %PDF-
//   return head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46 && head[4] === 0x2D;
// }
// function isPngMagic(buf) {
//   const h = new Uint8Array(buf.slice(0, 8));
//   return h[0] === 0x89 && h[1] === 0x50 && h[2] === 0x4E && h[3] === 0x47 && h[4] === 0x0D && h[5] === 0x0A && h[6] === 0x1A && h[7] === 0x0A;
// }
// function isJpegMagic(buf) {
//   const h = new Uint8Array(buf.slice(0, 3));
//   return h[0] === 0xFF && h[1] === 0xD8 && h[2] === 0xFF;
// }
// function isGifMagic(buf) {
//   const head = new TextDecoder().decode(new Uint8Array(buf.slice(0, 6)));
//   return head === 'GIF87a' || head === 'GIF89a';
// }
// function isWebpMagic(buf) {
//   // RIFF....WEBP
//   const u8 = new Uint8Array(buf.slice(0, 12));
//   const riff = String.fromCharCode(...u8.slice(0, 4));
//   const webp = String.fromCharCode(...u8.slice(8, 12));
//   return riff === 'RIFF' && webp === 'WEBP';
// }

// export default function SyllabusViewer({ url, className, height }) {
//   const [mode, setMode] = useState('loading'); // 'loading' | 'pdf-blob' | 'pdf-direct' | 'image' | 'gview' | 'link'
//   const [blobUrl, setBlobUrl] = useState(null);
//   const [err, setErr] = useState('');

//   useEffect(() => {
//     let revoked = false;
//     let created = null;

//     async function run() {
//       setErr('');
//       setBlobUrl(null);
//       setMode('loading');

//       // Try to fetch for type sniff + blob rendering.
//       // If CORS blocks, we'll infer from extension and choose best effort.
//       try {
//         const res = await fetch(url, { method: 'GET', cache: 'no-store' });
//         if (!res.ok) throw new Error(`HTTP ${res.status}`);
//         const buf = await res.arrayBuffer();

//         // Decide by magic bytes
//         if (isPdfMagic(buf)) {
//           const blob = new Blob([buf], { type: 'application/pdf' });
//           created = URL.createObjectURL(blob);
//           if (!revoked) {
//             setBlobUrl(created);     // inline, no auto-download
//             setMode('pdf-blob');
//           }
//           return;
//         }

//         if (isPngMagic(buf) || isJpegMagic(buf) || isGifMagic(buf) || isWebpMagic(buf)) {
//           // You can render <img src={url}> directly. If you want to ensure same-origin, use blob:
//           const type =
//             (isPngMagic(buf) && 'image/png') ||
//             (isJpegMagic(buf) && 'image/jpeg') ||
//             (isGifMagic(buf) && 'image/gif') ||
//             (isWebpMagic(buf) && 'image/webp') ||
//             'image/*';

//           const blob = new Blob([buf], { type });
//           created = URL.createObjectURL(blob);
//           if (!revoked) {
//             setBlobUrl(created);
//             setMode('image');
//           }
//           return;
//         }

//         // Unknown file: try Google Viewer
//         setMode('gview');
//       } catch (e) {
//         // CORS or network error.
//         // Heuristic fallbacks by extension:
//         const lower = (url || '').toLowerCase();
//         if (lower.match(/\.(png|jpe?g|gif|webp)(\?|$)/)) {
//           setMode('image'); // show raw URL; <img> doesn't need CORS for display
//           return;
//         }
//         if (lower.match(/\.pdf(\?|$)/)) {
//           setMode('pdf-direct'); // best effort direct iframe
//           return;
//         }
//         // Otherwise try Google viewer (often works for PDFs/docs)
//         setMode('gview');
//         setErr(e?.message || 'Fetch failed');
//       }
//     }

//     run();

//     return () => {
//       revoked = true;
//       if (created) URL.revokeObjectURL(created);
//     };
//   }, [url]);

//   // Render
//   if (mode === 'loading') {
//     return (
//       <div className={`p-6 text-center ${className || ''}`}>
//         <p className="text-sm text-muted-foreground">Loading…</p>
//       </div>
//     );
//   }

//   if (mode === 'pdf-blob' && blobUrl) {
//     return (
//       <iframe
//         key={blobUrl}
//         src={`${blobUrl}#view=FitH`}
//         title="Syllabus PDF"
//         style={{ width: '100%', height }}
//         className={className}
//       />
//     );
//   }

//   if (mode === 'pdf-direct') {
//     return (
//       <iframe
//         key={`direct-${url}`}
//         src={`${url}#view=FitH`}
//         title="Syllabus PDF"
//         style={{ width: '100%', height }}
//         className={className}
//       />
//     );
//   }

//   if (mode === 'image') {
//     // Prefer blobUrl if we created one; else fallback to raw URL
//     const src = blobUrl || url;
//     return (
//       <div className={`p-4 ${className || ''}`} style={{ maxHeight: typeof height === 'number' ? `${height}px` : height, overflow: 'auto' }}>
//         <img src={src} alt="Syllabus" style={{ maxHeight: '70vh', width: '100%', height: 'auto', objectFit: 'contain' }} />
//       </div>
//     );
//   }

//   if (mode === 'gview') {
//     return (
//       <iframe
//         key={`gview-${url}`}
//         src={toGView(url)}
//         title="Syllabus Document"
//         style={{ width: '100%', height }}
//         className={className}
//       />
//     );
//   }

//   return (
//     <div className={`p-6 text-center ${className || ''}`}>
//       <p className="mb-2 text-muted-foreground">
//         Couldn’t embed this file. {err && `(${err})`}
//       </p>
//       <a href={url} target="_blank" rel="noreferrer" className="underline">
//         Open in new tab
//       </a>
//     </div>
//   );
// }

// SyllabusViewer.propTypes = {
//   url: PropTypes.string.isRequired,
//   className: PropTypes.string,
//   height: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
// };

// SyllabusViewer.defaultProps = {
//   className: '',
//   height: '70vh',
// };
import React, { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { Document, Page, pdfjs } from 'react-pdf';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
// Set up the worker for pdf.js (required for react-pdf)
pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;

function toGView(url) {
  return `https://docs.google.com/gview?embedded=1&url=${encodeURIComponent(url)}`;
}

// Simple magic-byte sniffers
function isPdfMagic(buf) {
  const head = new Uint8Array(buf.slice(0, 5));
  return head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46 && head[4] === 0x2D;
}
function isPngMagic(buf) {
  const h = new Uint8Array(buf.slice(0, 8));
  return h[0] === 0x89 && h[1] === 0x50 && h[2] === 0x4E && h[3] === 0x47 && h[4] === 0x0D && h[5] === 0x0A && h[6] === 0x1A && h[7] === 0x0A;
}
function isJpegMagic(buf) {
  const h = new Uint8Array(buf.slice(0, 3));
  return h[0] === 0xFF && h[1] === 0xD8 && h[2] === 0xFF;
}
function isGifMagic(buf) {
  const head = new TextDecoder().decode(new Uint8Array(buf.slice(0, 6)));
  return head === 'GIF87a' || head === 'GIF89a';
}
function isWebpMagic(buf) {
  const u8 = new Uint8Array(buf.slice(0, 12));
  const riff = String.fromCharCode(...u8.slice(0, 4));
  const webp = String.fromCharCode(...u8.slice(8, 12));
  return riff === 'RIFF' && webp === 'WEBP';
}

// Detect mobile device
function isMobile() {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

// ✅ Updated MobilePdfViewer with responsive width + sticky controls
function MobilePdfViewer({ url, blobUrl, className, height }) {
  const [numPages, setNumPages] = useState(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [containerWidth, setContainerWidth] = useState(null);
  const containerRef = React.useRef(null);

  function onDocumentLoadSuccess({ numPages }) {
    setNumPages(numPages);
  }

  useEffect(() => {
    function handleResize() {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.offsetWidth);
      }
    }
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    // Outer wrapper: fixed height, flex column
    <div
      ref={containerRef}
      className={`mobile-pdf-viewer ${className || ''}`}
      style={{
        height,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden', // no scroll here
      }}
    >
      {/* Scrollable PDF area — takes all remaining space */}
      <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
        <Document
          file={blobUrl || url}
          onLoadSuccess={onDocumentLoadSuccess}
          loading={<p className="text-center p-4">Loading PDF…</p>}
          error={<p className="text-center p-4 text-red-500">Failed to load PDF.</p>}
          className="pdf-document"
        >
          <Page
            pageNumber={pageNumber}
            width={containerWidth || undefined}
            renderTextLayer={false}        // removes text layer spacing
            renderAnnotationLayer={false}
            className="pdf-page"
          />
        </Document>
      </div>

      {/* Nav buttons: always pinned to bottom, no sticky needed */}
      {numPages > 1 && (
        <div
          className="flex justify-center items-center gap-4 p-2 bg-white border-t border-gray-200 flex-shrink-0"
        >
          <button
            onClick={() => setPageNumber((p) => Math.max(1, p - 1))}
            disabled={pageNumber <= 1}
            className="px-3 py-1 bg-gray-200 rounded disabled:opacity-50"
          >
            Previous
          </button>
          <span className="text-sm">
            Page {pageNumber} of {numPages}
          </span>
          <button
            onClick={() => setPageNumber((p) => Math.min(numPages, p + 1))}
            disabled={pageNumber >= numPages}
            className="px-3 py-1 bg-gray-200 rounded disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
MobilePdfViewer.propTypes = {
  url: PropTypes.string.isRequired,
  blobUrl: PropTypes.string,
  className: PropTypes.string,
  height: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
};

export default function SyllabusViewer({ url, className, height }) {
  const [mode, setMode] = useState('loading');
  const [blobUrl, setBlobUrl] = useState(null);
  const [err, setErr] = useState('');
  const [gviewError, setGviewError] = useState(false);
  const mobile = isMobile();

  // Bust cache because S3 overwrites use the same exact URL
  const bustedUrl = React.useMemo(() => {
    if (!url) return url;
    try {
      const u = new URL(url);
      if (!u.searchParams.has('t')) {
        u.searchParams.set('t', Date.now());
      }
      return u.toString();
    } catch {
      return `${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}`;
    }
  }, [url]);

  useEffect(() => {
    let revoked = false;
    let created = null;

    async function run() {
      setErr('');
      setBlobUrl(null);
      setGviewError(false);
      setMode('loading');

      const lower = (url || '').toLowerCase();

      // Fast path: obvious images by extension (mobile + desktop)
      if (lower.match(/\.(png|jpe?g|gif|webp)(\?|$)/)) {
        setMode('image');
        return;
      }

      // Fast path: .pdf URLs with extension (mobile + desktop)
      if (lower.match(/\.pdf(\?|$)/)) {
        if (mobile) {
          console.log('Mobile PDF viewer (by extension)');
          setMode('pdf-mobile');
        } else {
          setMode('pdf-direct');
        }
        return;
      }

      // No/unknown extension → try fetch + magic-byte sniffing (mobile + desktop)
      try {
        const res = await fetch(bustedUrl, { method: 'GET', cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const buf = await res.arrayBuffer();

        if (isPdfMagic(buf)) {
          const blob = new Blob([buf], { type: 'application/pdf' });
          created = URL.createObjectURL(blob);
          if (!revoked) {
            setBlobUrl(created);
            // Mobile: react-pdf viewer, Desktop: blob iframe
            setMode(mobile ? 'pdf-mobile' : 'pdf-blob');
          }
          return;
        }

        if (isPngMagic(buf) || isJpegMagic(buf) || isGifMagic(buf) || isWebpMagic(buf)) {
          const type =
            (isPngMagic(buf) && 'image/png') ||
            (isJpegMagic(buf) && 'image/jpeg') ||
            (isGifMagic(buf) && 'image/gif') ||
            (isWebpMagic(buf) && 'image/webp') ||
            'image/*';
          const blob = new Blob([buf], { type });
          created = URL.createObjectURL(blob);
          if (!revoked) {
            setBlobUrl(created);
            setMode('image');
          }
          return;
        }

        // Unknown file: try Google Viewer
        setMode('gview');
      } catch (e) {
        // CORS ya network error
        setErr(e?.message || 'Fetch failed');

        // Last resort: Google Viewer (mobile + desktop)
        setMode('gview');
      }
    }

    run();

    return () => {
      revoked = true;
      if (created) URL.revokeObjectURL(created);
    };
  }, [url, bustedUrl, mobile]);

  // Render based on mode
  if (mode === 'loading') {
    return (
      <div className={`p-6 text-center ${className || ''}`}>
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (mode === 'pdf-mobile') {
    return (
      <MobilePdfViewer
        url={bustedUrl}
        blobUrl={blobUrl}
        className={className}
        height={height}
      />
    );
  }

  if (mode === 'pdf-blob' && blobUrl) {
    return (
      <iframe
        key={blobUrl}
        src={`${blobUrl}#view=FitH`}
        title="Syllabus PDF"
        style={{ width: '100%', height }}
        className={className}
      />
    );
  }

  if (mode === 'pdf-direct') {
    return (
      <iframe
        key={`direct-${bustedUrl}`}
        src={`${bustedUrl}#view=FitH`}
        title="Syllabus PDF"
        style={{ width: '100%', height }}
        className={className}
      />
    );
  }

  if (mode === 'image') {
    const src = blobUrl || url;
    return (
      <div
        className={`p-4 ${className || ''}`}
        style={{
          maxHeight: typeof height === 'number' ? `${height}px` : height,
          overflow: 'auto'
        }}
      >
        <img
          src={src}
          alt="Syllabus"
          style={{ maxHeight: '70vh', width: '100%', height: 'auto', objectFit: 'contain' }}
        />
      </div>
    );
  }

  if (mode === 'gview') {
    if (gviewError) {
      // Fallback when iframe fails
      return (
        <div className={`p-6 text-center ${className || ''}`}>
          <p className="mb-2 text-muted-foreground">
            Unable to display document via Google Viewer.
          </p>
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="px-4 py-2 bg-blue-600 text-white rounded inline-block"
          >
            Open Document Directly
          </a>
        </div>
      );
    }

    return (
      <iframe
        key={`gview-${url}`}
        src={toGView(url)}
        title="Syllabus Document"
        style={{ width: '100%', height }}
        className={className}
        onError={() => setGviewError(true)}
      />
    );
  }

  // Fallback mode (used for unknown file types on mobile)
  if (mode === 'fallback') {
    return (
      <div className={`p-6 text-center ${className || ''}`}>
        <p className="mb-2 text-muted-foreground">
          This file type cannot be previewed on your device.
        </p>
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="px-4 py-2 bg-blue-600 text-white rounded inline-block"
        >
          Open Document Directly
        </a>
      </div>
    );
  }

  // Generic fallback
  return (
    <div className={`p-6 text-center ${className || ''}`}>
      <p className="mb-2 text-muted-foreground">
        Couldn’t embed this file. {err && `(${err})`}
      </p>
      <a href={url} target="_blank" rel="noreferrer" className="underline">
        Open in new tab
      </a>
    </div>
  );
}

SyllabusViewer.propTypes = {
  url: PropTypes.string.isRequired,
  className: PropTypes.string,
  height: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
};

SyllabusViewer.defaultProps = {
  className: '',
  height: '70vh',
};