// ================================================================
//  A12-icons.js — Catalogo unico delle SVG e immagini (Data URI)
//  Ibride: Stati principali State-of-the-Art + Micro-icone UI originali
// ================================================================
(function () {
  'use strict';

  const rawSvgs = {
    // -------------------------------------------------------------
    // STATI PRINCIPALI (Design moderno, pulito e d'impatto)
    // -------------------------------------------------------------
    noChannel: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="100%" height="100%">
  <defs>
    <radialGradient id="grad-glow-amber" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#F59E0B" stop-opacity="0.15"/>
      <stop offset="100%" stop-color="#F59E0B" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <circle cx="200" cy="180" r="110" fill="url(#grad-glow-amber)" />
  <ellipse cx="200" cy="285" rx="70" ry="10" fill="#E2E8F0" />
  
  <path d="M 175 285 L 225 285 L 210 245 L 190 245 Z" fill="#334155" />
  <rect x="105" y="115" width="190" height="130" rx="14" fill="#0F172A" />
  <rect x="115" y="125" width="170" height="110" rx="8" fill="#1E1B4B" />
  
  <path d="M 170 170 A 40 40 0 0 1 230 170" fill="none" stroke="#F59E0B" stroke-width="4" stroke-linecap="round" opacity="0.4"/>
  <path d="M 180 182 A 25 25 0 0 1 220 182" fill="none" stroke="#F59E0B" stroke-width="4" stroke-linecap="round"/>
  <circle cx="200" cy="195" r="5" fill="#F59E0B" />
  <line x1="155" y1="210" x2="245" y2="150" stroke="#F59E0B" stroke-width="4" stroke-linecap="round" />

  <text x="200" y="340" font-family="system-ui, -apple-system, sans-serif" font-size="22" font-weight="700" fill="#F59E0B" text-anchor="middle" letter-spacing="-0.3">Nessun canale disponibile</text>
  <text x="200" y="372" font-family="system-ui, -apple-system, sans-serif" font-size="15" font-weight="400" fill="#64748B" text-anchor="middle">Seleziona una playlist per iniziare</text>
</svg>`,

    searchEmpty: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="100%" height="100%">
  <defs>
    <radialGradient id="grad-glow-cyan" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#06B6D4" stop-opacity="0.15"/>
      <stop offset="100%" stop-color="#06B6D4" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <circle cx="200" cy="180" r="110" fill="url(#grad-glow-cyan)" />
  <ellipse cx="200" cy="285" rx="75" ry="10" fill="#E2E8F0" />
  
  <rect x="110" y="110" width="180" height="130" rx="14" fill="#0F172A" opacity="0.9" />
  <rect x="125" y="130" width="150" height="12" rx="6" fill="#334155" />
  <rect x="125" y="152" width="100" height="10" rx="5" fill="#1E293B" />
  <rect x="125" y="170" width="120" height="10" rx="5" fill="#1E293B" />
  
  <g transform="translate(15, -10)">
    <circle cx="215" cy="175" r="36" fill="#FEF3C7" stroke="#F59E0B" stroke-width="6" />
    <line x1="242" y1="202" x2="275" y2="235" stroke="#F59E0B" stroke-width="10" stroke-linecap="round" />
    <line x1="203" y1="175" x2="227" y2="175" stroke="#F59E0B" stroke-width="4" stroke-linecap="round" />
  </g>

  <text class="search-empty-svg-title" x="200" y="340" font-family="system-ui, -apple-system, sans-serif" font-size="22" font-weight="700" fill="#F59E0B" text-anchor="middle" letter-spacing="-0.3"></text>
  <text class="search-empty-svg-hint"  x="200" y="372" font-family="system-ui, -apple-system, sans-serif" font-size="15" font-weight="400" fill="#64748B" text-anchor="middle"></text>
</svg>`,

    searchEmptyStatic: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="100%" height="100%">
  <defs>
    <radialGradient id="grad-glow-cyan-st" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#06B6D4" stop-opacity="0.15"/>
      <stop offset="100%" stop-color="#06B6D4" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <circle cx="200" cy="180" r="110" fill="url(#grad-glow-cyan-st)" />
  <ellipse cx="200" cy="285" rx="75" ry="10" fill="#E2E8F0" />
  
  <rect x="110" y="110" width="180" height="130" rx="14" fill="#0F172A" opacity="0.9" />
  <rect x="125" y="130" width="150" height="12" rx="6" fill="#334155" />
  <rect x="125" y="152" width="100" height="10" rx="5" fill="#1E293B" />
  <rect x="125" y="170" width="120" height="10" rx="5" fill="#1E293B" />
  
  <g transform="translate(15, -10)">
    <circle cx="215" cy="175" r="36" fill="#FEF3C7" stroke="#F59E0B" stroke-width="6" />
    <line x1="242" y1="202" x2="275" y2="235" stroke="#F59E0B" stroke-width="10" stroke-linecap="round" />
    <line x1="203" y1="175" x2="227" y2="175" stroke="#F59E0B" stroke-width="4" stroke-linecap="round" />
  </g>

  <text x="200" y="340" font-family="system-ui, -apple-system, sans-serif" font-size="22" font-weight="700" fill="#F59E0B" text-anchor="middle" letter-spacing="-0.3">Nessun risultato</text>
  <text x="200" y="372" font-family="system-ui, -apple-system, sans-serif" font-size="15" font-weight="400" fill="#64748B" text-anchor="middle">Nessun canale corrisponde ai criteri</text>
</svg>`,

    nopref: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="100%" height="100%">
  <defs>
    <radialGradient id="grad-glow-star" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#F59E0B" stop-opacity="0.2"/>
      <stop offset="100%" stop-color="#F59E0B" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <circle cx="200" cy="175" r="115" fill="url(#grad-glow-star)" />
  <ellipse cx="200" cy="285" rx="65" ry="10" fill="#E2E8F0" />
  
  <g transform="translate(0, -5)">
    <polygon points="200,95 224,147 280,154 238,193 250,248 200,220 150,248 162,193 120,154 176,147" fill="#F59E0B" />
    <polygon points="200,95 224,147 280,154 238,193 200,220" fill="#FBBF24" opacity="0.6" />
    
    <path d="M 130 115 L 133 123 L 141 126 L 133 129 L 130 137 L 127 129 L 119 126 L 127 123 Z" fill="#F59E0B" opacity="0.6"/>
    <path d="M 270 110 L 272 116 L 278 118 L 272 120 L 270 126 L 268 120 L 262 118 L 268 116 Z" fill="#FBBF24" opacity="0.5"/>
  </g>

  <text x="200" y="340" font-family="system-ui, -apple-system, sans-serif" font-size="22" font-weight="700" fill="#F59E0B" text-anchor="middle" letter-spacing="-0.3">Nessun preferito</text>
  <text x="200" y="372" font-family="system-ui, -apple-system, sans-serif" font-size="15" font-weight="400" fill="#64748B" text-anchor="middle">Seleziona i preferiti dalla lista canali</text>
</svg>`,

    noepg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="100%" height="100%">
  <defs>
    <radialGradient id="grad-glow-epg" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#6366F1" stop-opacity="0.15"/>
      <stop offset="100%" stop-color="#6366F1" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <circle cx="200" cy="180" r="110" fill="url(#grad-glow-epg)" />
  <ellipse cx="200" cy="285" rx="85" ry="10" fill="#E2E8F0" />
  
  <g transform="translate(0, -10)">
    <rect x="105" y="115" width="190" height="135" rx="14" fill="#0F172A" />
    <rect x="120" y="130" width="160" height="20" rx="6" fill="#4338CA" />
    <rect x="120" y="158" width="45" height="18" rx="4" fill="#06B6D4" opacity="0.8" />
    <rect x="170" y="158" width="110" height="18" rx="4" fill="#1E293B" />
    
    <rect x="120" y="182" width="75" height="18" rx="4" fill="#1E293B" />
    <rect x="200" y="182" width="80" height="18" rx="4" fill="#F59E0B" opacity="0.8" />
    
    <rect x="120" y="206" width="110" height="18" rx="4" fill="#1E293B" />
    <rect x="235" y="206" width="45" height="18" rx="4" fill="#334155" />
  </g>

  <text x="200" y="340" font-family="system-ui, -apple-system, sans-serif" font-size="22" font-weight="700" fill="#F59E0B" text-anchor="middle" letter-spacing="-0.3">Nessun EPG caricato</text>
  <text x="200" y="372" font-family="system-ui, -apple-system, sans-serif" font-size="15" font-weight="400" fill="#64748B" text-anchor="middle">Carica un file EPG per iniziare</text>
</svg>`,

    noplaylist: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="100%" height="100%">
  <defs>
    <radialGradient id="grad-glow-pl" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#06B6D4" stop-opacity="0.15"/>
      <stop offset="100%" stop-color="#06B6D4" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <circle cx="200" cy="180" r="110" fill="url(#grad-glow-pl)" />
  <ellipse cx="200" cy="285" rx="75" ry="10" fill="#E2E8F0" />
  
  <g transform="translate(0, -10)">
    <rect x="115" y="110" width="170" height="135" rx="14" fill="#0F172A" />
    <path d="M 115 124 C 115 116 121 110 129 110 L 165 110 L 180 125 L 271 125 C 279 125 285 131 285 139 L 285 231 C 285 239 279 245 271 245 L 129 245 C 121 245 115 239 115 231 Z" fill="#1E293B" />
    <circle cx="200" cy="185" r="28" fill="#F59E0B" />
    <line x1="200" y1="171" x2="200" y2="199" stroke="#0F172A" stroke-width="4" stroke-linecap="round" />
    <line x1="186" y1="185" x2="214" y2="185" stroke="#0F172A" stroke-width="4" stroke-linecap="round" />
  </g>

  <text x="200" y="340" font-family="system-ui, -apple-system, sans-serif" font-size="22" font-weight="700" fill="#F59E0B" text-anchor="middle" letter-spacing="-0.3">Nessuna playlist caricata</text>
  <text x="200" y="372" font-family="system-ui, -apple-system, sans-serif" font-size="15" font-weight="400" fill="#64748B" text-anchor="middle">Carica una playlist per iniziare</text>
</svg>`,

    nofullepg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="100%" height="100%">
  <defs>
    <radialGradient id="grad-glow-fullepg" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#F59E0B" stop-opacity="0.12"/>
      <stop offset="100%" stop-color="#F59E0B" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <circle cx="200" cy="180" r="110" fill="url(#grad-glow-fullepg)" />
  <ellipse cx="200" cy="285" rx="80" ry="10" fill="#E2E8F0" />
  
  <g transform="translate(0, -10)">
    <rect x="110" y="115" width="180" height="135" rx="14" fill="#0F172A" />
    <rect x="125" y="130" width="150" height="14" rx="7" fill="#06B6D4" opacity="0.9" />
    <rect x="125" y="155" width="42" height="30" rx="6" fill="#1E293B" stroke="#334155" stroke-width="1.5" stroke-dasharray="4 3" />
    <rect x="174" y="155" width="101" height="30" rx="6" fill="#1E293B" stroke="#334155" stroke-width="1.5" stroke-dasharray="4 3" />
    <rect x="125" y="192" width="90" height="30" rx="6" fill="#1E293B" stroke="#334155" stroke-width="1.5" stroke-dasharray="4 3" />
    <rect x="222" y="192" width="53" height="30" rx="6" fill="#1E293B" stroke="#334155" stroke-width="1.5" stroke-dasharray="4 3" />
  </g>

  <text x="200" y="340" font-family="system-ui, -apple-system, sans-serif" font-size="22" font-weight="700" fill="#F59E0B" text-anchor="middle" letter-spacing="-0.3">Nessun EPG disponibile</text>
  <text x="200" y="372" font-family="system-ui, -apple-system, sans-serif" font-size="15" font-weight="400" fill="#64748B" text-anchor="middle">Seleziona un EPG per visualizzare i programmi</text>
</svg>`,

    // -------------------------------------------------------------
    // MICRO-ICONE UI 
    // -------------------------------------------------------------

// -------------------------------------------------------------
    // EPG MANAGER ICON (Trasparente, Extra-Large / Massima Copertura)
    // -------------------------------------------------------------
    tasto3: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="100%" height="100%">
  <defs>
    <linearGradient id="epg-active-grad" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#34D399"/>
      <stop offset="100%" stop-color="#059669"/>
    </linearGradient>
  </defs>
  
  <!-- Cornice esterna trasparente a tutto campo (occupa dal px 10 al px 190) -->
  <rect x="10" y="10" width="180" height="180" rx="22" fill="none" stroke="#34D399" stroke-width="3" opacity="0.85"/>
  
  <!-- Header orario superiore -->
  <rect x="10" y="10" width="180" height="36" rx="22" fill="#1E293B" opacity="0.75"/>
  <line x1="60" y1="20" x2="60" y2="36" stroke="#34D399" stroke-width="3" stroke-linecap="round"/>
  <line x1="110" y1="20" x2="110" y2="36" stroke="#94A3B8" stroke-width="3" stroke-linecap="round" opacity="0.5"/>
  <line x1="160" y1="20" x2="160" y2="36" stroke="#94A3B8" stroke-width="3" stroke-linecap="round" opacity="0.5"/>

  <!-- Riga Canale 1 (Con programma LIVE in evidenza) -->
  <circle cx="30" cy="80" r="7" fill="#34D399"/>
  <rect x="46" y="58" width="74" height="44" rx="8" fill="url(#epg-active-grad)"/>
  <rect x="126" y="58" width="54" height="44" rx="8" fill="#1E293B" stroke="#334155" stroke-width="2" opacity="0.85"/>

  <!-- Riga Canale 2 -->
  <circle cx="30" cy="140" r="7" fill="#94A3B8" opacity="0.6"/>
  <rect x="46" y="118" width="48" height="44" rx="8" fill="#1E293B" stroke="#334155" stroke-width="2" opacity="0.85"/>
  <rect x="100" y="118" width="80" height="44" rx="8" fill="#1E293B" stroke="#334155" stroke-width="2" opacity="0.85"/>

  <!-- Linea verticale "Ora corrente" -->
  <line x1="108" y1="42" x2="108" y2="180" stroke="#FFFFFF" stroke-width="3" stroke-dasharray="5 4" opacity="0.9"/>
</svg>`,

// -------------------------------------------------------------
    // TASTO 9 — INDEX CARD / SCHEDE ARCHIVIO (Minimal & Editoriale)
    // -------------------------------------------------------------
    tasto9: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="100%" height="100%">
  <!-- Scheda posteriore / Tab di archivio -->
  <path d="M 50 50 L 95 50 L 105 62 L 150 62 C 156 62 160 66 160 72 L 160 148 C 160 154 156 158 150 158 L 50 158 C 44 158 40 154 40 148 L 40 58 C 40 52 44 50 50 50 Z" 
        fill="#1c1c1a" stroke="#d4a373" stroke-width="2.5" opacity="0.6"/>

  <!-- Scheda principale frontale (taglio netto pulito) -->
  <rect x="40" y="74" width="120" height="84" rx="8" fill="#1c1c1a" stroke="#d8a47f" stroke-width="2.5"/>

  <!-- Unico accento di inchiostro tipografico (senza troppe righe) -->
  <circle cx="64" cy="116" r="6" fill="#d8a47f"/>
  <line x1="82" y1="116" x2="138" y2="116" stroke="#f2efe9" stroke-width="4" stroke-linecap="round"/>
</svg>`
};

  window.ZappOneIcons = {};
  window.ZappOneIconsRaw = {};

  for (const [key, svg] of Object.entries(rawSvgs)) {
    if (svg && svg.trim().length > 0) {
      window.ZappOneIcons[key] = 'data:image/svg+xml;utf8,' + encodeURIComponent(svg.trim());
      window.ZappOneIconsRaw[key] = svg.trim();
    }
  }

  window.ZappOneIcons.epgPlaceholder = 'data:image/svg+xml;utf8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">' +
    '<rect width="120" height="120" rx="16" fill="#0F172A"/>' +
    '<rect x="20" y="35" width="80" height="50" rx="8" fill="#1E293B" stroke="#334155" stroke-width="2"/>' +
    '<polygon points="52,50 52,70 72,60" fill="#6366F1"/>' +
    '</svg>'
  );

  window.ZappOneIcons.demoLogo = function(label, bg, fg) {
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect width="120" height="120" rx="24" fill="' + bg + '"/>' +
      '<text x="60" y="72" text-anchor="middle" font-family="system-ui, sans-serif" font-size="34" font-weight="700" fill="' + fg + '">' + label + '</text></svg>'
    );
  };

  console.log('[ZappOneIcons] pronto (Stati moderni + Micro-icone originali).');
})();