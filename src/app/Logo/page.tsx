"use client"; 

import { toPng } from 'html-to-image';
import { useRef } from 'react';

export default function RSPage() {
  const ref = useRef(null);

  const handleDownloadImage = () => {
    if (ref.current === null) {
      return;
    }
    toPng(ref.current, { cacheBust: true, })
      .then((dataUrl) => {
        const link = document.createElement('a');
        link.download = 'tkr-logo.png';
        link.href = dataUrl;
        link.click();
      })
      .catch((err) => {
        console.log(err);
      });
  };

  return (
    <div className="flex flex-col items-center justify-center w-screen h-screen bg-transparent">
      <div ref={ref}>
        <div className="w-80 h-80 rounded-full bg-gradient-to-br from-emerald-500 to-emerald-400 flex items-center justify-center">
          <span className="text-9xl font-bold text-black">TKR</span>
        </div>
      </div>
      <button 
        onClick={handleDownloadImage} 
        className="mt-8 px-6 py-3 border border-gray-700 rounded-full text-white hover:border-emerald-500 transition-all"
      >
        Download as PNG
      </button>
    </div>
  );
}