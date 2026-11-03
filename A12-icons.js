// ================================================================
//  A12-icons.js — Catalogo unico delle SVG e immagini (Data URI)
//  Ibride: Stati principali State-of-the-Art + Micro-icone UI originali
// ================================================================
(function () {
  'use strict';

  // -------------------------------------------------------------
  // DIZIONARIO RAW SVG: Contiene le definizioni in stringa SVG pura
  // di tutti gli stati di fallback/vuoti e dei tasti UI borderless.
  // -------------------------------------------------------------
  const rawSvgs = {
    // -------------------------------------------------------------
    // STATI PRINCIPALI (Design moderno, pulito e d'impatto)
    // -------------------------------------------------------------

    // Stato: Nessun canale disponibile nell'elenco attuale
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

    // Stato: Nessun risultato trovato durante la ricerca
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

    // Stato: Lista preferiti vuota
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

    // Stato: Guida EPG non caricata
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

    // Stato: Nessuna playlist caricata nel sistema
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

    // Stato: EPG non disponibile per il canale specifico
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
    // MICRO-ICONE UI (Stile Borderless Uniforme, Sfondo #334155)
    // -------------------------------------------------------------

    // TASTO 3 — Palinsesto/Guida TV EPG (Griglia canali con indicatore LIVE verde smeraldo)
    tasto3: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100%" height="100%">
  <defs>
    <linearGradient id="epg-active-grad" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#34D399"/>
      <stop offset="100%" stop-color="#059669"/>
    </linearGradient>
  </defs>
  
  <!-- Sfondo card borderless coordinato -->
  <rect x="6" y="6" width="88" height="88" rx="22" fill="#334155" />
  
  <!-- Riga Canale 1 (Top) -->
  <circle cx="22" cy="27" r="3" fill="#94A3B8" opacity="0.6"/>
  <rect x="30" y="18" width="38" height="18" rx="4" fill="#0F172A" stroke="#334155" stroke-width="1" opacity="0.85"/>
  <rect x="72" y="18" width="14" height="18" rx="4" fill="#0F172A" stroke="#334155" stroke-width="1" opacity="0.85"/>

  <!-- Riga Canale 2 (Middle - Con programma LIVE in evidenza) -->
  <circle cx="22" cy="50" r="3" fill="#34D399"/>
  <rect x="30" y="41" width="32" height="18" rx="4" fill="url(#epg-active-grad)"/>
  <rect x="66" y="41" width="20" height="18" rx="4" fill="#0F172A" stroke="#334155" stroke-width="1" opacity="0.85"/>

  <!-- Riga Canale 3 (Bottom) -->
  <circle cx="22" cy="73" r="3" fill="#94A3B8" opacity="0.6"/>
  <rect x="30" y="64" width="22" height="18" rx="4" fill="#0F172A" stroke="#334155" stroke-width="1" opacity="0.85"/>
  <rect x="56" y="64" width="30" height="18" rx="4" fill="#0F172A" stroke="#334155" stroke-width="1" opacity="0.85"/>

  <!-- Linea verticale "Ora corrente" -->
  <line x1="50" y1="14" x2="50" y2="86" stroke="#FFFFFF" stroke-width="2" stroke-dasharray="3 2" opacity="0.9"/>
</svg>`,

// -------------------------------------------------------------
    // TASTO 9 — TIMBRO ESIBIZIONE (Con i tuoi colori e spessori, centrato)
    // -------------------------------------------------------------
    tasto9: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="100%" height="100%">

  
  <!-- Medaglione centrale stile timbro a secco (Fondo nero profondo con bordo Oro Champagne) -->
  <circle cx="100" cy="100" r="90" fill="#0F172A" stroke="#E2B784" stroke-width="3" opacity="0.90"/>
  
  <!-- Cerchio interno di incisione (tratteggio oro champagne elegante e rarefatto) -->
  <circle cx="100" cy="100" r="76" fill="none" stroke="#E2B784" stroke-width="2.5" stroke-dasharray="4 4" opacity="0.6"/>
  
  <!-- Simbolo geometrico centrale (spostato in basso di 12px, con i tuoi colori e spessori originali) -->
  <path d="M 100 52 L 150 78 L 100 104 L 50 78 Z" fill="none" stroke="green" stroke-width="4" stroke-linejoin="round"/>
  
  <path d="M 55 96 L 100 120 L 145 96" fill="none" stroke="orange" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
  
  <path d="M 55 122 L 100 146 L 145 122" fill="none" stroke="#94A3B8" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`,

// -------------------------------------------------------------
    // TASTO ICON — Riproduttore TV/Monitor (Geometria centrata con paesaggio luminoso)
    // -------------------------------------------------------------
    tastoIcon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="100%" height="100%">
  <defs>
    <!-- Sfondo cielo sfumato vivace e luminoso -->
    <linearGradient id="thumb-sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#2563EB"/>
      <stop offset="50%" stop-color="#4F46E5"/>
      <stop offset="100%" stop-color="#7C3AED"/>
    </linearGradient>
    <!-- Sole / Elemento circolare luminoso -->
    <linearGradient id="thumb-sun" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#FDE047"/>
      <stop offset="100%" stop-color="#F43F5E"/>
    </linearGradient>
    <!-- Maschera per contenere il paesaggio dentro i bordi dello schermo centrato -->
    <clipPath id="screen-clip">
      <rect x="28" y="58" width="144" height="84" rx="12"/>
    </clipPath>
  </defs>
  
  <!-- Sfondo tile base -->
  <rect width="200" height="200" rx="40" fill="#334155"/>
  
  <!-- Cornice Monitor centrata perfettamente al centro della tile -->
  <rect x="20" y="48" width="160" height="104" rx="18" fill="#1E293B" stroke="#38BDF8" stroke-opacity="0.9" stroke-width="3"/>
  
  <!-- Schermo interno con paesaggio colorato -->
  <g clip-path="url(#screen-clip)">
    <!-- Sfondo cielo luminoso -->
    <rect x="28" y="58" width="144" height="84" fill="url(#thumb-sky)"/>
    
    <!-- Sole / Elemento luminoso centrale -->
    <circle cx="100" cy="88" r="18" fill="url(#thumb-sun)" opacity="0.95"/>
    
    <!-- Montagne / Onde stilizzate sovrapposte con colori contrastanti -->
    <path d="M 28 126 L 64 94 L 100 126 L 136 102 L 172 118 L 172 142 L 28 142 Z" fill="#1E1B4B" opacity="0.9"/>
    <path d="M 28 132 L 78 110 L 122 132 L 172 120 L 172 142 L 28 142 Z" fill="#0F172A"/>
  </g>
  
  <!-- Bordo interno di finitura dello schermo -->
  <rect x="28" y="58" width="144" height="84" rx="12" fill="none" stroke="#64748B" stroke-width="2"/>
  
  <!-- Base del monitor posizionata correttamente sotto -->
  <path d="M 52 156 L 148 156 L 158 168 L 42 168 Z" fill="#CBD5E1"/>
</svg>`
  };

  // -------------------------------------------------------------
  // REGISTRAZIONE E TRASFORMAZIONE IN DATA-URI PER WINDOW
  // -------------------------------------------------------------
  window.ZappOneIcons = {};
  window.ZappOneIconsRaw = {};

  // Ciclo per convertire ciascuna stringa SVG in Data-URI compatibile con tag <img> / CSS
  for (const [key, svg] of Object.entries(rawSvgs)) {
    if (svg && svg.trim().length > 0) {
      window.ZappOneIcons[key] = 'data:image/svg+xml;utf8,' + encodeURIComponent(svg.trim());
      window.ZappOneIconsRaw[key] = svg.trim();
    }
  }

  // Placeholder dinamico standard per singoli eventi EPG senza logo
  window.ZappOneIcons.epgPlaceholder = 'data:image/svg+xml;utf8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">' +
    '<rect width="120" height="120" rx="16" fill="#0F172A"/>' +
    '<rect x="20" y="35" width="80" height="50" rx="8" fill="#1E293B" stroke="#334155" stroke-width="2"/>' +
    '<polygon points="52,50 52,70 72,60" fill="#6366F1"/>' +
    '</svg>'
  );

  // Helper per la generazione di loghi segnaposto dinamici a partire da testo e colori personalizzati
  window.ZappOneIcons.demoLogo = function(label, bg, fg) {
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect width="120" height="120" rx="24" fill="' + bg + '"/>' +
      '<text x="60" y="72" text-anchor="middle" font-family="system-ui, sans-serif" font-size="34" font-weight="700" fill="' + fg + '">' + label + '</text></svg>'
    );
  };

  console.log('[ZappOneIcons] pronto (Stati moderni + Micro-icone originali).');
})();