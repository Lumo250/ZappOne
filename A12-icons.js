// ================================================================
//  A12-icons.js — Catalogo unico delle SVG e immagini (Data URI)
// ================================================================
(function () {
  'use strict';

  const rawSvgs = {
    noChannel: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="100%" height="100%">
  <g transform="translate(0, -20)">
    <ellipse cx="200" cy="305" rx="80" ry="12" fill="#E2E8F0" />
    <rect x="110" y="180" width="180" height="110" rx="12" fill="#312E81" />
    <rect x="125" y="195" width="150" height="80" rx="6" fill="#1E1B4B" />
    <rect x="180" y="290" width="40" height="10" rx="4" fill="#1E1B4B" />
    <rect x="150" y="300" width="100" height="8" rx="4" fill="#1E1B4B" />
    <line x1="200" y1="180" x2="160" y2="130" stroke="#94A3B8" stroke-width="4" stroke-linecap="round" />
    <line x1="200" y1="180" x2="240" y2="130" stroke="#94A3B8" stroke-width="4" stroke-linecap="round" />
    <circle cx="160" cy="130" r="6" fill="#F59E0B" />
    <circle cx="240" cy="130" r="6" fill="#F59E0B" />
    <path d="M 140 110 Q 200 80 260 110" fill="none" stroke="#F59E0B" stroke-width="4" stroke-linecap="round" stroke-dasharray="8 8" opacity="0.5" />
    <path d="M 120 90 Q 200 40 280 90" fill="none" stroke="#F59E0B" stroke-width="4" stroke-linecap="round" stroke-dasharray="8 8" opacity="0.5" />
  </g>
  <text x="200" y="345" font-family="system-ui, -apple-system, sans-serif" font-size="22" font-weight="700" fill="#F59E0B" text-anchor="middle">Nessun canale disponibile</text>
  <text x="200" y="380" font-family="system-ui, -apple-system, sans-serif" font-size="16" font-weight="400" fill="#64748B" text-anchor="middle">Seleziona una playlist per iniziare</text>
</svg>`,
    
       searchEmpty: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="100%" height="100%">
  <!-- Ombra a terra -->
  <ellipse cx="200" cy="288" rx="120" ry="12" fill="#E2E8F0" />

  <!-- Pannello/browser (x=70-290, y=48-270) -->
  <rect x="70" y="48" width="220" height="222" rx="16" fill="#312E81" />
  <rect x="82" y="60" width="196" height="198" rx="8" fill="#F8FAFC" />

  <!-- Barra superiore azzurra -->
  <rect x="82" y="60" width="196" height="26" rx="8" fill="#06B6D4" />
  <rect x="82" y="72" width="196" height="14" fill="#06B6D4" />
  <circle cx="100" cy="73" r="3.5" fill="#FFFFFF" fill-opacity="0.85" />
  <circle cx="112" cy="73" r="3.5" fill="#FFFFFF" fill-opacity="0.85" />
  <circle cx="124" cy="73" r="3.5" fill="#FFFFFF" fill-opacity="0.85" />

  <!-- Righe vuote tratteggiate -->
  <rect x="100" y="105" width="160" height="20" rx="4" fill="none" stroke="#CBD5E1" stroke-width="2" stroke-dasharray="6 4" />
  <rect x="100" y="140" width="160" height="20" rx="4" fill="none" stroke="#CBD5E1" stroke-width="2" stroke-dasharray="6 4" />
  <rect x="100" y="175" width="160" height="20" rx="4" fill="none" stroke="#CBD5E1" stroke-width="2" stroke-dasharray="6 4" />

  <!-- Base/piedistallo (punto più basso y=288) -->
  <rect x="165" y="270" width="30" height="10" rx="4" fill="#1E1B4B" />
  <rect x="135" y="280" width="90" height="8" rx="4" fill="#1E1B4B" />

  <!-- Lente d'ingrandimento ambra (sovrapposta a destra) -->
  <line x1="267" y1="222" x2="311" y2="265" stroke="#F59E0B" stroke-width="13" stroke-linecap="round" />
  <circle cx="237" cy="192" r="44" fill="#FEF3C7" stroke="#F59E0B" stroke-width="6" />
  <path d="M 213 170 Q 227 158 245 158" fill="none" stroke="#FFFFFF" stroke-width="5" stroke-linecap="round" />

  <!-- X dentro la lente -->
  <line x1="219" y1="174" x2="255" y2="210" stroke="#F59E0B" stroke-width="6" stroke-linecap="round" />
  <line x1="255" y1="174" x2="219" y2="210" stroke="#F59E0B" stroke-width="6" stroke-linecap="round" />

  <!-- Testo: stessa tipografia, palette e posizioni di noChannel/noepg/nofullepg.
       Contenuto aggiornato da A02-search.js in updateSearchEmptyState. -->
  <text class="search-empty-svg-title" x="200" y="345" font-family="system-ui, -apple-system, sans-serif" font-size="22" font-weight="700" fill="#F59E0B" text-anchor="middle"></text>
  <text class="search-empty-svg-hint"  x="200" y="380" font-family="system-ui, -apple-system, sans-serif" font-size="16" font-weight="400" fill="#64748B" text-anchor="middle"></text>
</svg>`,


    nopref: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="100%" height="100%">
  <ellipse cx="200" cy="310" rx="80" ry="15" fill="#E2E8F0" />
  <rect x="120" y="230" width="160" height="50" rx="25" fill="#E2E8F0" />
  <circle cx="150" cy="230" r="35" fill="#E2E8F0" />
  <circle cx="200" cy="215" r="45" fill="#E2E8F0" />
  <circle cx="250" cy="230" r="35" fill="#E2E8F0" />
  <circle cx="150" cy="225" r="30" fill="#FFFFFF" fill-opacity="0.5" />
  <circle cx="200" cy="210" r="40" fill="#FFFFFF" fill-opacity="0.5" />
  <polygon points="200,120 215,160 258,160 223,185 236,228 200,203 164,228 177,185 142,160 185,160" fill="#F59E0B" />
  <polygon points="200,140 210,165 238,165 215,182 224,210 200,193 176,210 185,182 162,165 190,165" fill="#FCD34D" />
  <path d="M 130 140 L 135 150 L 145 155 L 135 160 L 130 170 L 125 160 L 115 155 L 125 150 Z" fill="#F59E0B" opacity="0.7" />
  <path d="M 270 130 L 273 136 L 279 139 L 273 142 L 270 148 L 267 142 L 261 139 L 267 136 Z" fill="#F59E0B" opacity="0.5" />
  <path d="M 280 200 L 282 205 L 287 207 L 282 209 L 280 214 L 278 209 L 273 207 L 278 205 Z" fill="#F59E0B" opacity="0.6" />
  <text x="200" y="345" font-family="system-ui, -apple-system, sans-serif" font-size="22" font-weight="700" fill="#F59E0B" text-anchor="middle">Nessun preferito</text>
  <text x="200" y="380" font-family="system-ui, -apple-system, sans-serif" font-size="16" font-weight="400" fill="#64748B" text-anchor="middle">Seleziona i preferiti dalla lista canali</text>
</svg>`,
    
    noepg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="100%" height="100%">
  <ellipse cx="160" cy="270" rx="90" ry="12" fill="#E2E8F0" />
  <ellipse cx="270" cy="290" rx="45" ry="8" fill="#E2E8F0" />
  <rect x="70" y="100" width="180" height="140" rx="12" fill="#312E81" />
  <rect x="80" y="110" width="160" height="120" rx="6" fill="#F8FAFC" />
  <rect x="80" y="110" width="160" height="20" rx="6" fill="#E2E8F0" />
  <line x1="110" y1="130" x2="110" y2="230" stroke="#CBD5E1" stroke-width="2" />
  <line x1="140" y1="130" x2="140" y2="230" stroke="#CBD5E1" stroke-width="2" />
  <line x1="170" y1="130" x2="170" y2="230" stroke="#CBD5E1" stroke-width="2" />
  <line x1="200" y1="130" x2="200" y2="230" stroke="#CBD5E1" stroke-width="2" />
  <line x1="230" y1="130" x2="230" y2="230" stroke="#CBD5E1" stroke-width="2" />
  <line x1="80" y1="150" x2="240" y2="150" stroke="#CBD5E1" stroke-width="2" />
  <line x1="80" y1="170" x2="240" y2="170" stroke="#CBD5E1" stroke-width="2" />
  <line x1="80" y1="190" x2="240" y2="190" stroke="#CBD5E1" stroke-width="2" />
  <line x1="80" y1="210" x2="240" y2="210" stroke="#CBD5E1" stroke-width="2" />
  <line x1="150" y1="110" x2="150" y2="230" stroke="#F59E0B" stroke-width="3" />
  <rect x="115" y="135" width="20" height="10" rx="3" fill="#94A3B8" opacity="0.5" />
  <rect x="145" y="155" width="20" height="10" rx="3" fill="#94A3B8" opacity="0.5" />
  <rect x="175" y="175" width="20" height="10" rx="3" fill="#94A3B8" opacity="0.5" />
  <rect x="205" y="195" width="20" height="10" rx="3" fill="#94A3B8" opacity="0.5" />
  <rect x="140" y="240" width="40" height="15" rx="4" fill="#1E1B4B" />
  <rect x="110" y="255" width="100" height="10" rx="5" fill="#1E1B4B" />
  <path d="M 230 180 L 290 180 L 310 200 L 310 280 L 230 280 Z" fill="#FFFFFF" stroke="#312E81" stroke-width="3" stroke-linejoin="round" />
  <path d="M 290 180 L 290 200 L 310 200 Z" fill="#E2E8F0" stroke="#312E81" stroke-width="3" stroke-linejoin="round" />
  <rect x="245" y="215" width="50" height="40" rx="4" fill="none" stroke="#06B6D4" stroke-width="3" />
  <rect x="245" y="215" width="50" height="12" rx="4" fill="#06B6D4" />
  <line x1="245" y1="235" x2="295" y2="235" stroke="#06B6D4" stroke-width="3" />
  <line x1="260" y1="227" x2="260" y2="255" stroke="#06B6D4" stroke-width="3" />
  <line x1="280" y1="227" x2="280" y2="255" stroke="#06B6D4" stroke-width="3" />
  <rect x="265" y="260" width="10" height="12" fill="#F59E0B" />
  <polygon points="255,272 285,272 270,285" fill="#F59E0B" />
  <text x="200" y="345" font-family="system-ui, -apple-system, sans-serif" font-size="22" font-weight="700" fill="#F59E0B" text-anchor="middle">Nessun EPG caricato</text>
  <text x="200" y="380" font-family="system-ui, -apple-system, sans-serif" font-size="16" font-weight="400" fill="#64748B" text-anchor="middle">Carica un file EPG per iniziare</text>
</svg>`,
    
    noplaylist: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="100%" height="100%">
  <ellipse cx="130" cy="270" rx="80" ry="12" fill="#E2E8F0" />
  <ellipse cx="280" cy="270" rx="45" ry="8" fill="#E2E8F0" />
  <rect x="50" y="100" width="160" height="150" rx="16" fill="#312E81" />
  <rect x="60" y="110" width="140" height="130" rx="8" fill="#F8FAFC" />
  <rect x="60" y="110" width="140" height="24" rx="8" fill="#E2E8F0" />
  <circle cx="130" cy="185" r="35" fill="none" stroke="#94A3B8" stroke-width="3" stroke-dasharray="8 8" />
  <line x1="130" y1="170" x2="130" y2="200" stroke="#94A3B8" stroke-width="4" stroke-linecap="round" />
  <line x1="115" y1="185" x2="145" y2="185" stroke="#94A3B8" stroke-width="4" stroke-linecap="round" />
  <rect x="100" y="250" width="60" height="12" rx="4" fill="#1E1B4B" />
  <rect x="80" y="262" width="100" height="8" rx="4" fill="#1E1B4B" />
  <line x1="225" y1="185" x2="210" y2="185" stroke="#F59E0B" stroke-width="6" stroke-linecap="round" />
  <polygon points="215,175 215,195 200,185" fill="#F59E0B" />
  <path d="M 240 130 L 300 130 L 320 150 L 320 240 L 240 240 Z" fill="#E2E8F0" transform="translate(4, 4)" />
  <path d="M 240 130 L 300 130 L 320 150 L 320 240 L 240 240 Z" fill="#FFFFFF" stroke="#312E81" stroke-width="3" stroke-linejoin="round" />
  <path d="M 300 130 L 300 150 L 320 150 Z" fill="#E2E8F0" stroke="#312E81" stroke-width="3" stroke-linejoin="round" />
  <rect x="255" y="160" width="50" height="45" rx="6" fill="none" stroke="#06B6D4" stroke-width="3" />
  <line x1="265" y1="172" x2="295" y2="172" stroke="#06B6D4" stroke-width="3" stroke-linecap="round" />
  <line x1="265" y1="182" x2="285" y2="182" stroke="#06B6D4" stroke-width="3" stroke-linecap="round" />
  <polygon points="285,190 285,200 295,195" fill="#06B6D4" />
  <text x="200" y="340" font-family="system-ui, -apple-system, sans-serif" font-size="22" font-weight="700" fill="#F59E0B" text-anchor="middle">Nessuna playlist caricata</text>
  <text x="200" y="375" font-family="system-ui, -apple-system, sans-serif" font-size="16" font-weight="400" fill="#64748B" text-anchor="middle">Carica una playlist per iniziare</text>
</svg>`,
    
    nofullepg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="100%" height="100%">
  <g transform="translate(0, -30)">
    <ellipse cx="200" cy="285" rx="75" ry="12" fill="#E2E8F0" />
    <rect x="110" y="140" width="180" height="160" rx="16" fill="#312E81" />
    <rect x="120" y="150" width="160" height="140" rx="8" fill="#FFFFFF" />
    <rect x="120" y="150" width="160" height="30" rx="8" fill="#06B6D4" />
    <rect x="120" y="165" width="160" height="15" fill="#06B6D4" />
    <circle cx="140" cy="165" r="4" fill="#FFFFFF" fill-opacity="0.8" />
    <circle cx="155" cy="165" r="4" fill="#FFFFFF" fill-opacity="0.8" />
    <rect x="135" y="195" width="35" height="25" rx="4" fill="#E2E8F0" />
    <rect x="180" y="195" width="35" height="25" rx="4" fill="#E2E8F0" />
    <rect x="225" y="195" width="35" height="25" rx="4" fill="#E2E8F0" />
    <rect x="135" y="230" width="35" height="25" rx="4" fill="#E2E8F0" />
    <rect x="180" y="230" width="35" height="25" rx="4" fill="#E2E8F0" />
    <rect x="225" y="230" width="35" height="25" rx="4" fill="#E2E8F0" />
    <line x1="255" y1="235" x2="285" y2="265" stroke="#F59E0B" stroke-width="12" stroke-linecap="round" />
    <circle cx="235" cy="215" r="38" fill="#FEF3C7" stroke="#F59E0B" stroke-width="6" />
    <path d="M 215 195 Q 225 185 240 185" fill="none" stroke="#FFFFFF" stroke-width="5" stroke-linecap="round" />
    <path d="M 225 215 Q 235 205 245 215 Q 245 225 235 230" fill="none" stroke="#FFFFFF" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" />
  </g>
  <text x="200" y="345" font-family="system-ui, -apple-system, sans-serif" font-size="22" font-weight="700" fill="#F59E0B" text-anchor="middle">Nessun EPG disponibile</text>
  <text x="200" y="380" font-family="system-ui, -apple-system, sans-serif" font-size="16" font-weight="400" fill="#64748B" text-anchor="middle">Seleziona un EPG per visualizzare i programmi</text>
</svg>`,
    
    tasto3: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none">
  <defs>
    <linearGradient id="epg-green" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%"   stop-color="#34D399"/>
      <stop offset="100%" stop-color="#059669"/>
    </linearGradient>
  </defs>
  <rect x="3"    y="4.5"  width="5.4" height="4.4" rx="1.1" fill="url(#epg-green)" opacity="0.28"/>
  <rect x="3"    y="9.8"  width="5.4" height="4.4" rx="1.1" fill="url(#epg-green)" opacity="0.28"/>
  <rect x="3"    y="15.1" width="5.4" height="4.4" rx="1.1" fill="url(#epg-green)" opacity="0.28"/>
  <rect x="9.3"  y="4.5"  width="5.4" height="4.4" rx="1.1" fill="url(#epg-green)"/>
  <rect x="9.3"  y="9.8"  width="5.4" height="4.4" rx="1.1" fill="url(#epg-green)"/>
  <rect x="9.3"  y="15.1" width="5.4" height="4.4" rx="1.1" fill="url(#epg-green)"/>
  <rect x="15.6" y="4.5"  width="5.4" height="4.4" rx="1.1" fill="url(#epg-green)" opacity="0.55"/>
  <rect x="15.6" y="9.8"  width="5.4" height="4.4" rx="1.1" fill="url(#epg-green)" opacity="0.55"/>
  <rect x="15.6" y="15.1" width="5.4" height="4.4" rx="1.1" fill="url(#epg-green)" opacity="0.55"/>
</svg>`,
    
    tasto9: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100%" height="100%">
  <rect x="6" y="6" width="88" height="88" rx="22" fill="#1E3A8A" stroke="none" />
  <rect x="6" y="6" width="88" height="88" rx="22" fill="none" stroke="#FFFFFF" stroke-opacity="0.15" stroke-width="1.5" />
  <rect x="22" y="30" width="56" height="40" rx="6" fill="none" stroke="#FFFFFF" stroke-width="4" stroke-linejoin="round" />
  <line x1="50" y1="30" x2="38" y2="16" stroke="#FFFFFF" stroke-width="3.5" stroke-linecap="round" />
  <line x1="50" y1="30" x2="62" y2="16" stroke="#FFFFFF" stroke-width="3.5" stroke-linecap="round" />
  <line x1="44" y1="70" x2="44" y2="78" stroke="#FFFFFF" stroke-width="4" stroke-linecap="round" />
  <line x1="56" y1="70" x2="56" y2="78" stroke="#FFFFFF" stroke-width="4" stroke-linecap="round" />
  <line x1="36" y1="78" x2="64" y2="78" stroke="#FFFFFF" stroke-width="4" stroke-linecap="round" />
  <circle cx="34" cy="40" r="2.5" fill="#FFFFFF" stroke="none" />
  <line x1="42" y1="40" x2="70" y2="40" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round" />
  <circle cx="34" cy="50" r="2.5" fill="#FFFFFF" stroke="none" />
  <line x1="42" y1="50" x2="66" y2="50" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round" />
  <circle cx="34" cy="60" r="2.5" fill="#FFFFFF" stroke="none" />
  <line x1="42" y1="60" x2="60" y2="60" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round" />
</svg>`
  };

  const tastoIconBase64 = `iVBORw0KGgoAAAANSUhEUgAAAFoAAABaCAYAAAA4qEECAAAAIGNIUk0AAHomAACAhAAA+gAAAIDoAAB1MAAA6mAAADqYAAAXcJy6UTwAAAAGYktHRAD/AP8A/6C9p5MAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAAHdElNRQfqBAEQCCo5c7NPAAABZHpUWHRSYXcgcHJvZmlsZSB0eXBlIHhtcAAAKJF9UkFyxCAMu/OKPoFYxibPIQFunemxz6+cZLfd3bZkBgKWZSGcPt8/0lsM2JqwY3r1bIvBNiuukk2smNtqA118zG3bpjjPV9M4KY6iHVm7ZwWxlURavTkTC7zpKGpcSQgwSRwTI/fcsHtF82pMtR7lbJEce9ttONASAV2EetRmKEE7A3f4FMEgkRBhaEVU1R5JIpYYDKLqyi+jMXH6MWQ4UTJsEugysWCNj38Zwlk497OA9ORwehG1vUqPChH/qYECaAqvLLZ6JnKl9kFNV5y3EZuJzoWB4WA5zGxmDBmKBVBRSM+rA/SsU1WYsPCMK4D4ixWJC9+AgAphOtk5Hh0IDfabBYf+cfqbwmBuQLmd7lxJ4YgM5LvVN7Km4djKJz/tuC6Kkahl/yb4G3ig/nEtPYPO573OXnrn1lWvTZyi9tmvfPCjAdMX/46zOgtnZoIAAAABb3JOVAHPoneaAAA29klEQVR42mW9WbAkyXWe+R13j4jMvHttXdXVXV1djV7QWNhYSVASCXIIkqJIUdzEbYyijBqzMcmMo7HRw9g84XGe9Dp6Gj1ohosILkYOCYIkFoIgdjQWAo1e0EtVdXV37XW3zNjczzy4e0Rkscxu1a28eSM8jp/zn/8sflIePXNWRQQEUBARRBj+iAjo+P34M5m8Z/K/9Ib8PhFBEFQVRRHiNVQ1/QyCKqTv4z0m185/S/zdvE6I18g30xBQwKTfz9dXVUII6ZcEMWktmi6jEDTE9yPptfS76LAWndxzeu1hDZP1aFpzXqoCTkQwa5KaCDm9GckXkUEg+eYi6UFVyXKId0iLVEXHvRrukwUqCEYCqusLSL+axMMo5OH6961VDJIFI/kxx/uY9P+gDJsNEFBMFnAStQ7bmxaeFWx44Pyc8eeaN3EqmKxsaZ3OTDXI5Dfm640PFxc3eVIBa6aqn9cha9o8CEriDUTG9cqgxXa8TtZ0kahp+anyotO/gyLJKNBRwDqsCQVrDE7ig3mNwh7XNWpm1vCslyG/MN00QKeqKqNljNs0alyWhRs2bc1MWRMwKBhBJosw6SeCoDI+V9Zwpq8NN8w3G4U5FewaFEzMMz7goDeo6PDgU8vKMDcY38SQS2sitARofd7AUZezpaqChgRxRIhZ0+R0j6kSTDc3w899j4tDBTHrpjaxinSJeNv4vqmGTnZ8AiOD4U2uJQl2NIRo5vcL9z4oyGuxRgZrGgUYNz3/mkZ1mvzedIMFCFRW8AmbrTDARWB89rhpo+9YB7N1XFYByRCget+b06p03Go3OIkEKKNQ1i1wzdRZ+2uCjaOpZAEaYwZ7FECsGe6XcS47q2wdJl1L77vXqLXr/sCHJIiJohgBO8GprcrQ9DrcJyQI8Sr4jMoCxgghxOexItFRT56HiTM0a75JBqgZtHqq0SPuTi64BkT3MwD+kTaOQk6MIihT3yaJNUSlNvdpCogxky3TZMI6GOGgmaqjkJM/MALGgA86CFgQrAEn8RpWhDMblsNGsS10Ado+0AWQENU63g8CEi+S/mRhDrCSN0WzPQx6tGZSmWlJ0jBnEo3JuzSKUyeC+sf0bUpzBrwdHKhiMBNnJ8O1h02ZbOPahk0WfT+c3c9A8toNUDhDryARVCmsMHMGh1JZ4ZFTJXeODXdWStPDQd1x3CqBQCVRD1uvI0Rk0JxA1Ggx6/RwNP513zHsBxqd4QRVR/FOHUy6mq5RIWXEFjO+L2tohoZMj4xBjMGIQTLYZx6qgRDCmvAHerL2AKPjGR5GQZNm75SGto+ceF5GuNiqLNuV5YnHtrl1s+b6fs+9lQdRvPYURlAVlr0m7Q1TnjFhOdkiBYJhYAYyClSm/xlFjSq4NX46oTMZBga2MOyQDkEBxqy9TsKtQQgSA4TI7CyuqCjKGWU5J2jAdy2+b/B9i+Bj0JEfQEdOPOC7ZHiZ+Pm0zl6VPgTObFhUwFnh5EbB+TMzTp+c88R7H+TU6/fYvHbEletLGh+YW+Go8Vw/6iNMGMFjolVMLHe8+f2WN264JFMc6Oggy/irbjT3QT0QkgwHyqNDQKCacFAEldGpreveaA3GCGIs1lVU82029s6wefIMqsrRnVvUB3fo633aZhXvo6MDGjB/omGSBAJAigbzQ/dBaDy8/WzJzkbB5qLg4tOnOffkRc4/9TjbF64i332NXq6ztzBcud5w56ZinSP0geDXHapOrEoEQkiiMpLpSsR1nbC1wdbX6Z4bbSNj5zo25wc2KeAw+Uawrr0Zw5Jjy9GmIFhbUM22WJw4yzvf/0F+4sd/GOsKPvO5r/CVz/4tq9uevm/R4FGfrq8yBBEGGZzoND2Q4SWuz2BFwUAdDO+9uMGFJ89w6qkPcubt/5zZ5hnmZy7j5eNsVoaX/uEGL7zVY63BSqBHMKJYE9nDwJ/zhiNYmwkDkNFDswufosWUJETxurjWCVsWM36PDLtmjFlzYqPGxSe39+UG8m4aMThb4qoFew+c59d+5Wd5+olL1A1snbvE67ePuPzFG1hXoL6HEBetomiY3HtNuKzjtMT3WKNUzuCc5bgx7F64xPn3/Brl4sG4Se4Up5/oWd65RSd3mc0d7qiLEbERRAUJId3GTL1yUrQpEeAfCfc+cTN1eG5KWdb58ujZR56dN2S8kKJrm5B3cwolMUBxsHWKu4uz3D30NG2g8xXm5EVs1tZBe+JlQuakOqF8EdMiKqZEkCFqzLwQZha2K8PmRknTb9O5k5TJMkSEYB/AbZ3kzPlN7t47wrctLljuLgNNZ6iToEHJ7D6H1SojDZyKdECYpARRV5UQciAjGLnfgQ2yik7PGBkxcQhoJl44LyqEwfPGiM6k9wVC8KCeu7fu8hffvM1Ld+DOMsCq5l++9wJnzz0Qf58IG9aYmJ+wNq5BxtemD5c5dGGF0goza5g7izXCbL7Jg5feTyUuWaxEjO0OmG/MOHlqk0fObPDwXsWZhWWnhMpEWujSZhsUa7KyTRQsxflTcjGuR4ZgxpiYzDII9szu7kfNwDAmZi+CyYHEJEob9GmyOTnLJ2Kw1qxl9ASw1mCsI/Se1165ynM3LS9cO2DP1fyzdz3Ak089weVXX+XmW29G7Gfk5jJYFZPXIk/PpqqJicSEkWXr1Fm+/2d+kwef+EEO7x5z463rWOM5vv1dDl7/FK88+y2+9603efGVQ158Y8Xr+z13a2XZK20QvEoKKA2q8drZegarXVPOqbJO1jqRpT2zvfvRzE+HlGL29qprFG/NvM0Y4ZmkhWv5hrwAk6PIgAZPOLjOG9/5HC9//TO8/MKLnD//KO96x0Weed/7uHXzJq9fvrIGcSIMHHx0SnagdSKCs5bSGQpnuXjpEr/67/8XHn/X+7n5xl0+82cf48qzf8CmeZnrL32O26+8zPLGHa5cOeDqzSV3lj3HTcCrEAYBTwV2f25npK4ZywcWNoTg/zietmd2o6AzQzCyTs2m3Dh792newSSubCTn83SdDSRzVw2EvqXvVph+ifVLjm5f5aWXLnP+wuO87dKDvOcD7yP0nssvv4xqiBYlYI0dTdJEqzFpLYWzVIWjLCxPv/vd/OZv/688cvFt3Lh6hz/7vY/xlc/9MfW9m+zYQ958+TovvXCH168dU9c9Nw87DtpA3St90Bh+T3IwmTlp8nwZuHJskC1t0MY1RpT/iu+1Z7Z3Ppp3I19gGi6vaXkSWsajiF8MQp7Cj0w0TkxMHPVdi+9bfNfQtysk9BzdfYuXXrrC+Ycf58LDp/m+97+Pze0tLn/vZbq2pSwczlqKwlEmgTpnKZzFOYMrLLNZxfs/9CF+43/+D5w5fZab1+7xh7/zR3z2s3/IweE+3aphM3RceeOYa3cb3trvuHnY4VNE2PZjcWKssozOLbp8HYTGxOIJuh7ApjxRdr4yaPTO7kdztGeNSVo0OsCpsHNe2CUHWZiUchTBGXPf+6abZVIOJiAp7A7BE3yPauDg3g1eevF1zl94nLMPbPPk29/O+UcucPXVVwihp5pVzGZl/Cod1ayiLAvKsqCqZvzwR36cX/m3v8Xmxha3rx/yh7/zp/zVJ3+Xw8N7BO/RoGyIcPVuy+2lp+6FozZw0ITIDohZPMRMUsPZ+ekg3CzLIfRIr6iMmDzkPya0WQH7wM7uR9eFaUZcMmPkJ0ShOhO9skGZWaGYaLlM2AkZNgbBm3g9MzqR4GOOA1Xu3H6Dl164wsWLT3Lq9CbnL1zg8Sef4sabb9C1NRuLGfOqZFaVLOZzFosZm5sb/NhP/TQ/9XO/SOEc+3eW/PHv/Dmf+Ovf5eDoHt73kTqaggLD7dpz3CmdVzofs3idRnpoE20cUqADZ57m402ExAl5zXn2+0LiETlyOuidFy4Oe5Op1eAcc9I9UT1nBCsxWyaibBURO+teCSoEiblcHy82sIGpVYkxhBDpYNd29EnYIcTS0ZNP/wC//b/9Nk+9/SFsUXDvzm3eunaVsqzGnDmC9x5XFDz8yCWCDywPG/7s9/+SP/rj/8rB0R1EA84Is6KgcJbd0nDYBTodIVAnDsxIyk/ngIWYCojp15HH5ULuGDjG70N6YS2dlOKMoIozRlKaVwfozqLREMm3EcEKky/BWWF3ZjEGDttYTdCURO81akrQmN+NwccEhkzEdVMWmL6n9+B9wGB4+cWv8rHf+z3+0//xH6mA7Z0T7O6dSpo/PkCOarquw4jhxede4eOf+AOO6gNAsNbhnMVYi1c4aj29AsYM6dWcss057pzLDinvHWFUh5Swz+FgztQNSa6JOmmuNU4wXkHeffFRnRZUzZBDTv9PTMSlwKAwUBjDzMGlvRlG4O7KU7j4QG1QOjG0ajHlnGqxQTXfYrG1yXxjk42NTRaLBbPFBrPZhKIocWVBWVbx+7Jg78QJHrl4MaVOR4vI+QfNQKkh1vcUlsdLrrx+ma5r6dqGvu/xfUfXNNT1ir6pWa1WrFZLVssVx0dHLI+OWB0fszw+ZrVa0TQNXdfjvR+ZRNLZEAI+pweGNoOpiBUNitdANoJptcllh2XW4soRLixxp0srlE6oDMwK2KwcD5+oKAVO1J6N3W1mp8+xff4SJ85fYvv0WbZ3T7CxtU1VVRRFgXUu5VLMEASEVN3Igsx9GL7vJ/mDiIoaJiWl9GCaalKz2Zynnnh6oFg5os0MaUq9FAje03UtbdNQ1zWHhwe89cY1Xnv5e7z03ee5evkKR4eHQ+VmKAtmrWcswQ1FWiNYNUiuME1SqfLui49q5qtGcwpS152fgVlh2KwMCydsVoYTGwUffHKXzZ0t5PTTPPL+H+HkI08w39jCGJOEENAQ8D7gQ4aRXK9L5hh0EKAmqqSBAbezd9eQcgeM5qvJxGUw1fu4vc0xgLLWgJNUKTs8YwSxsSihKKt6ydUrl/m7T3+az3/mM9y5fZtAWnPSUB9GSBlaDNIawqDxkqxBke979DE1k5yFS7RNUSxQGKG0ykZl2ZkX7C0cpzYLHjw94z3/7D089KGfY/PcO3HOon1ANUCIC+l7pes8y5VnWfesVj2rVctq2VIva9q6oVm28d9VR9t09L2nbz1d2+F7T/Ae7z3Bh5gQ1ngPA1iJ+Y9ITYXCufhlHaW1zIrIUspZyXxeUW0sKOcl1aKknBcUswI7d9jKYZykiCQKydrImF557VU+9v/8N5790hdpex8dpE42PVvIpLQX8z46pC5CUOQ9lx7T0ZtHjC4MbFhwJuZnF4WwObOc3nSc3Sl58Nwmj3/g+3nyJ3+Lxd4ZtO8GTdzfX3HtjTu8+fotbr15nTev3+DO3XscHx+zXNUsVzVN6wk4PJbe26jtwRK8AywaDKKCxSLBYDqwXii8UKhS+I5CPBaPoUW0h1Aj2iESEDxGPYKP2kyIhQxjEGMpXEVZzZjNN9ja3WN77yQ7p05w5qEznL70AFvntzGVRX3AOsuyrvnY//vf+Ms//RPa3scoUjM85JazJPCUHLtf0C4ZQ4zZE1yQUoJ7c0floCoM2wvHmZ2SB89VPPbMO3nqn/8W873TaOhBhPpwySv/8ALf/PKXePP1q3Q4brstbpodDquz9Ft7UO0Sim2UBWI2UWYELfGdIewLUlsKFYpgqHqYB2Hhhc02sGgDi65n0bYsuoa5tpTU2LCEZoUc38PS4qzH0WO1w4QGE2pMf4wNh/hwjzrs0/nb1OGYe7QcaMtllDu2pC232Ttxgbc/8x6+73/4IKeeOI0PnsI4funX/w3L4yV/8/G/GGuCGbqERFnjBgxdAtlhR2cYtyKG1IJL9E2ATpWHFwUnNh3V3HHuzJzzjz3ApQ//GvOdU/FC4ljeeZMrn/8kV597llCdY/Hhn+fo3DvYqvbYcTMKiQI0AboGmpWyXClHS+XoCNrrPb7owYDplbJTNoCNHja8Z0M8c+tZaEMVako6ytBTaIuRHvVtpJ0GCgeVCE4MhTocJXPjmRWG0s0p7R7O1DjTIlLjm3365jbHq1u8fnyNr9/+Hl/462d57htf48P/4qd58sfegZkVGLH8/C//Oq++8grPf/c7a6WeCSHO6Q1yy0EuczlJUZE1ZuDJhYHKxfRmq8K5UyXnH95gvjfnofd9mJ3zTyZfW+JX1zl++ROE5iqbP/TryIUf5KHFgrmNBdPDHu42Mf984wCu78O9Q6VeQbuEcMsjhwHTgenAdRBWYBvBdAptQFtP33V0fctcOyrtmGtPHzpMU+PqGqHFmg6aFkKHaAc0ICuCbfBFi7qG4Fp81WFmPa70FNsLimrGwpzi9OGbPHPtu/xwfZffv3WXP/q96/yL5jd410+/j1Aou7t7/MzP/xJX/vOr1E0TO58mWU6ToGItjE/U2eXEeiZdVqCywkZp2Z45trccwTm2z2zw8Hvexu7bfyhWEMQAgXD8DVy1z+KD/w639zQzp9QauN0L12r43rFy+QhuH0F9BM0S+kboW5C7HtkP0CimFkwLZS3YpaepFTpFOwhNoG1aat9TCyyAHqX0HbZeUYUVIi2FeCS0CPHLssSxxJgVmBVBGoJpMMWS4BpC1WLnPcw9WnmoPGw4HuOQ/1A1/Jd7PZ/8qz/j5CNnOf/MQ7R1x9NPv5unnn4n3/z61zAieA2jZg+V84GApBaGXJxVjYXJFGY7gcLCrDRsLCzzTYc3lmLzIuX2QyDRaRFWGFtTPfwv2ameJljljodrnfDSCr59qFw7gsMa2hX0DfhW6TtB7gaKuwFq0CVIDa4WqqWidXyfbwNt65GmQ3zAqNJpoCPQaQ99zSx0OKOUAkUIlCgFSikRw520FDQU2uKkxVHjuhXil0i/QrslUtdQNFCsQFZoCTvG82837vJ/3niWr/7d5znztp/DVI7SznjmvR/km19/dhJx6FrHQCQWJvXnkeQLSOKiWaOtid2Xi9IwKw2LhWO2KLEbDyX270CLyEG33kex9S5coTTArQ6eXyrfPlauN7DsoUsWvWph1Qn9gWJuesIKwkrQWtAlmOOAWQakBmqFVSAsW2g9xis2KEWAwgdsXzMjsF0UbFczFmVFVZZUZUFZGcoiUFRCWRH/XwlFpbjCY0uPLTy4HpEWqIFjkBU4DwVoCWce6PjxB6/zwvNf5NaV2/gAXe959NITbGxsgoahpqkhNwONVHmssoKrkjbMLGyUlp2ZZbeCs7uWC+crzl6Yc/bSSU4+fpHFmbcBZdRmPFAh7hLWOCqFvocdC+et0hiYKdwMwkqVD15QZgqffV65uR/QXuk78B1oK9hWKRowjSKtRnxuPK4PWAKGQEmgosPpioXxnNrYYPe0oSx7SttTaIdjhWOJ05JCGix1fE1WWDnGmAUiG4geAnMCJRIUaQ/AhTG7XwEnhA9s1Pzl117jjdde5+SjZwga2Ns9yalTpznY349tB7Le7DhtZc4w4roAXqAH2jbQBKX2hi50KCvUK07uMds6YPttJWgNONQfI7oEewEUlh1cXcF3l/DSkXDlSLl1DEcrOFEpv/q48OCG4cceDPyuDXzmy7BqQBpwneA6g+08pgfpo5BN53EohQYK8ZTS43TFjBV7exVP/btHOfORPaTI/UsK6mPLgO+TU+whRE5N6JDQQmhRbRDfotrB8iZ84Q+QL/8lBB/VcEfQTWF3Q3l4+4Abb70O/TME8VRlxanTZ3nl5e8N5QBjYuP82EGTo8gIzc4j+BCT3wFNdCTi9WwZ2Dju2TloONrvUlKnBVX8vVegv0638RCdKLd74TtL+PaRcvlQuXkEBzXUDcwmbRlPPmD43/9VwT95rOd3/7zluW8F5BhsA6ZVTB+QPmD7HqeeAh//1R7DEhuOqaThxGObnPvF07gtNyZwYh8ueA99G3vkgoXQxw1QB76E0EZsCHEz2NtGP/wL6JVnkRtvQGlgFyjAFsqlUzUv3nkD7XqwEX93d/eGPMw/+pOqLNP+RLfWEJO+74EeoQtQN4HlUUdzJIhx0MeKxerGNcLqOndPBV43sLJw3Ck3lsqdY+VwBcsa+lWgDT0hFEMKsbTCR95d8MzDhk/8bc1f/NEhb77U0HeGMjiMF5wJlMHjQkeJpwgttl9RUVPZlnBwSPNWB8alqnhup82a26fvPZG6+Bi6EtITxogxvkcQX6NEfGYHWGhEyArO7LV8+42b9KsG5gUisLm5EwMVYo56WrweWsJ07Adxmno1VGMl2CL4AH2AVafcPQ7s3Gp5pBHoLCEoSuDgrX1C23G5FJ51cL1XQqeYWlk2cNREphH2W7r9Q0K3RwgmWmbG85nhl35izgefcPz5H93l8399QH3bp57V+JylBkrtcH7FTFtm0jOjo375LV7+z1/g7Icv4eaCkR5je6ztsYXHSItIg9gWsTVIhzE16Ar6owh7oYvJpm6JfvlTyO3bsGlgO6mgEyiV7U1P3xzi6w5TOTDKxmIzdTPlzqZRu4dcxySgcdOzGtny+qDUfeC4gc3CsKo9bx0UPNUIrohh5q0bh3S98NwOfL2A/Q7uLRXXQtEp1AZ/HNDbS3R5D5ot8AX42KEfs3ERSs+ddfyb3zrJD3xwwd/8wQ1e+OItfNeAOkQLpO8otWZGy5yOgo6ib7j96S9x/fOfpKg8zrYUrqWSjpnpmdFSSoO1LdatMEVDaY9xHGDMMSI1Qo8xAQkB6TvkVMRmylTydgqFsrEZMFrTrWrKzRkaAvP5Amss3qec+QRFhkgxZ/ZEcENtN5VyQoBelKbz9E5ousBzb3WUh47OK716+i5w4/aSJTu8dAxXC1g2UZPbRigbKBulXQb6mw1m6aEXgpeUFlWCh+BTujE1gD/1dMWj/+k83/j0jC/898scvLqP1x4BCglU4pkTNboIDTPA1y3Sr3CupbQtlemZuY7SNFipcabB9jXOr7DuGOuWiK6iFxYfHagFsw3sARsRmymSoEthtgGFbfB9F1O46ilcOQiTKSTnnIaMpawh1xEY39SrYkL8xab3XDnwOIVeCjoP2gfaxnPz7pJ7xSneqA13W+hqpW6ha6GuBVcLs6MAd0owjpD6l73P2c6Uh87n0YLi+4CTwAc/vMcTTy741sdf53t/9T30zgFOhBJDJUKlPaWvKV1HVRSUDlzlKAqLszWFU5zrh8ZHY3ukbFNQ0oHxiZ4GsDFsYw5sm4FDU4Ak+CjniqVBuw7tPD4ohS0w1qJdykGnUpuZ5LVVJvRu7cQoY6O5R7hb96l3TGnV0vWBoErbeu4cdtyYFdxeCYcooYW2BV+DqeO/estQhTm2WKEKfa8JNiJDUK85mRulH6Kz8j6wsQkf+tmHePL7tnn+T5/j4NmruA4KtRS6orQ1s9KzOLtg88eexp3fREyL0CCmQ2gw1MASlSXYNi7MNKjWEGqgBQsSDuDmd5B7b8QwoZQo/PS9nSlGG0LfEnzA9wErDussSkj10klD5pBwirIMqrj7Go4xBnoV+j41xmislHQYui6CfNN6DurALSm42wiHQZAeQgOsJOZy7oHZT83dYtFArHj7ZGeTMtTgHMIYYQX11G+sWFjhvb/wNG9sltz75LdxCFaW2KKjKmD7l7+fxf/0w4iESNtCGyloWJJCz8j98+t6DGGF0ETHqC1oje4/gn7yY0h9DykEdYI6kBJMH1mQqk+wF7BisWY8iJp7WbLSTs8nigiO3B6bsk9DEzZgVBBVvI8NJr33hKB0feCoVW4XBfutoelBOsE2II0QllDcUcIqIKsenflYzuo8qrE3QkOAAMZrrMz4+IWPBdf+uMUvW3wTsBi2thxLDrEBXBFwziPSYR/cQsIK2ibSOG2TcJdJ2MsoaG3iVziOGK1tFDQ1iEEWFbqzgfq7UCSNLkALQWaCc6k7KbPEfIYwteYO7ZYTuBAR8okYF3KKj8mRhrRL+f9BiY6wD/HsSVAaD/daS90JvgNpNFpiC7KvmKOANh6/6vCLqNneK6oe0rEzCUrwCj7EjqI+oH3AH3c015doF6CHm6+8wo3Pfp6N7ghbVDgrOL9CmmPaz3yF8ultzJaAWaGySgLMgm2AFpG0CTGRAtJG6JAA4tGbr6PH95DCRFpXaHSIs1gNtzY2FwWvhD6gfqwZDtVyyccsRlad+0VihUXBT06MDvFMKoD2Qen6Hp8EHVTwWO61StMIsZFDoAOW4PZBOpA2IK0ifXR6oQ+pNUyRKWz0Ckmr+4OW+soxLAOHd+7ywmf/nlvf+BanW9gut3FisKHH6SHWNLSf/gKHbz5P8XCJzA/BHWJcg7geKaKzExfABcRoFKzx4Dwy85FZSAtvvY6EJTIj0rsCmIHMDNrGRktrDdrH9YbOD3lomHZp3VcESBJ1+fjK+JJO3pyr04GuS+avAcVhXMFy1dPVaQf7uF57D+wyCxpsp5Q9hC7gu1QZDor4KGz1injQLuAPOrrXW+o3Vrz4zW/y/Je+gL99ndO2ZGHnODwu1BRS48wSZzqsXxG+/Qbd8zXGrDDuGFPUmKpGqhYpuyhkF/LZ5JiB3AG2E+OoQDYFNpMDLCQmlTYMVLFfxdoS6wq6Plpk6Hxce6LGuT8vdy+R2uByy5sb+sQmoE4G80lw3nVdahuIml+UFf3dDr9StEiCXUKxr9gOTAO2M1S9oWyEfqX0RR4twXBilV7j942yutLw2tde4Ot/9zluXX6NhfecsgtOGMdcLIXEYqyVFc62uKKlqBqcCRjXY6xHygCzDln0MA9QpZKRSf0UhYEtgd0kZJuFS6R6NkeFwLwA6+h7j5jY3FOvokPsux4f+qHpfsDrQWNzWUvGUlamIiH1OmTNDpNSQdu0kTWoUhTCYjFHmxXaJAvowB2Aa5Im91AFoewF1wV8E+hrwbgYgouC+Mhs/Ep59Qtv8qW/+DuuPv8dinrFnlmwJ8IuLQtRSklFV2kwpsWVLeWiw20brDOIMzEZVMScry4KZGYj1jqNQjQKC4ETkKqlSdg+mqSVJGhi3rgswCh9L1g3w7qC0PaoCn3TxjaI9Cz3/4ntCCHVVSXebn1mhax1QeYOy9Vqhe991PRCWWwsMO0x0gRwFtNEQZs+rtupwfWC6z3O9/hGaSwUZezBsCZe+/oLh3zpz77JP3z+K7QHt9jFccKeZIeOTVZsoGwYWBiloqaUBud67K7gfvEnMP/kPUCLShtvLk10eDYthC7uqPQxSLF9/KIDzcmlJdz4KnLzq2BD3KxF1GaMp+2E0s3T8ZAlqpa2bfA5pzFwZx26rYbuqvTz4Sz40MuWnKNOMk+IsFqt6LvYWuD7ns3NDVx7A6l7dGaxhzEeIAVeroOiVaqup+h7fOfpGsH3gfmsoF56vv5XL/Oljz/LrWtXWYSePbbZQ9nWji3p2ZbAtjFsOWEhDTMaStvibId76jHsr/8kZsMPaVC0BVaRK5OoW5DEQnwSbH5/HwMksWBPoFsfhu4a1Ndg5qC08SSSUVYrYba5k7KXMeKr2yYegoK1IGXkbWt9pZHejfhsyJ06+Rdix6WhXq1omwbrCvquY3Njk1l/iFu19IsKdxAdn+0V2wlFp8x6mHuD6y2+T1SxM7z43B0+96ff4uVvvETZtezKFtvSs6UNW9qwKR3bArtSsOVgYVsqGkrTRW2WDqkPYfkmuHkUMm2kdCkajAKvUe0QrRPd66JjCH1KmybcTmfZ1ZSItVCWcQOkAFFWR4bFzgkUG/dTlOVyOfRwRB49jjYaMkzpxLGq5qTSKPkk3jXWITB0W86Mpet6dnd3WHCMPTrEuC3KI8X14HqoOmXRwry3bFChxytuvBLYOQFf+cz3+PrnnqO/e8S2LNiSDTZDzSY9O2LYwrApjl0jbFmYS0MVlpS2jppsWpzpkJdfov/vv4v70fciZQ+ujmZk+uiZTQd0UWmMj5EjuXsoJhYQC+qgB73+HGb/LdguwDgwW2B3Ud5itV+wuXeGrgmxNQ3DarWM7W8p/sgZ0Pv78HKCya3RkbQjgTWtR0Ro6pqmaamqBb737O3tcXJLqA6v4/05qiY+Z9XBvIVZpywCbFLSHwr/3/99hT68yd0bN5hjOO1Osq0d837Jpga2xLID7BjYMoYN6ZhpTakHOHMcK9jS4miwtNi2JfzhJ2n/7m+wmx1m3kdenJlDblLZENgWwiRJpIVB0zm+2MXvEX8PzhgoZ2DnUJ4FO6Ovb9Pub3Hq4nna4z5yfpTj48OYdx4gI/eYysg2JulSl6Eia7JO2HROihiEul5xfHTI9vZuxOjtbR575CzfefbbrJp3U3ih7GHRCrNWqRJ0lMFgWNDfdnhveMCcZRPDhi7Z1I5tsWxLwYYYNunYRpnjqbSjYJ/CHA9aXJio0UZiw0xBS9g/glWLKftYwc6soRDYiJ0ReqBQpi6JQpFiwjqMQGmQ3Qo2F0nIJ8HtILLi+NYMunNsnb7Am881aB9rgwfHd8eocILPisaTa5P2g0TvxlbWtapAYiDp0Cmr1ZLbt25x9uxDqeOz5f0feIYvfu1T3Dr8EZycY+6FWafMmsC8VwrfYzRQacFCdnE2MAs1C3/IBrBNwQ6wYYQZ9ZBrjv0Yhzg5inzZ9hTS4aTBSoM1DcaskGqJXfRQpYyCnWTdNgUeENhQxApSpdddivqckGbwwKKCrUXU5mIHipNgCkK/z1vPb7D18PvA7tIcXkW9oelabu/fGtFhzQmmDGhiHXkimVk/dSFr344d69C2HVevXqEPnhACB/uHPPnUk3zwPSfY7D7O7LinWsKsVuZ9oPQ91nuM7zFdz7yH7VCyHTw72rGtns0Acw1UoWVGQyVdTNSbI6xb4myLNfmrjgJ2NcbVSLWCWQuuQ2MVISqFScHHLlClRnGjESoMY5BikpBnNmpytQnFLpQnwC5AYP+acPjGOR78/p/k4NphPGoiwtHykNsHN9YS+/ksuJkEgDo4xqGLIUtVJ7GgJA6du/A9L734PKvjJSEEmqZhdbTkl3/1X/Hkpeeo+j9htlyy3cOeBLbEM8NThp4yLJlpzcwfMw+HLHQVGxalpqSmNDWVaShMnaDimMI0FK6jMG0KuWuMrTGugXIF8waKPs5XC7EfQ6zEXPKJFE7bKHQp0+s5AixMpG+VhZ0t2NiOAi5ORY0uCw7e6nj972ec/dCvoJzl4Oo+RhyC48rNy9xb3ksyk8TYdIgSh/ERuTNXFTO2MOW/GY8KpK0Jaccuv/YKV65cRkM8wH7jrVuUruTf/8f/kaff93XC/L8Q/AuUoWfLKbtlYKfs2a1aNquGjWLFZunZnMHmTNisAvOZZzZXypmnLFuKsqGoespZoKoCVeUpqh5bddiqRWY1stnALGGyUaQEqQTmBs4aOJ2+nxuYC8wTdFTE3oeFhc0STuzB1h4yWyCzOcy3aDvHta/e45W/Uvae+XVmD/0A1754FW0d6i110/Kty1+jD/14PHDtbCWwFgBG1bUP7O59dDgLKDnXMSF8OjrLpq4Bw+NPvgMQeh+4e2ufU6dP8k9/5AOY2RXeuPfX3Fu9iO+OML7Ghdj9udCaTePZsspWqWyUwkZlmM8Ni7kyXyjzDWW2Lcx3HIsTjtmupdiz2FMOc9JhToOcDsjJHtn1yK4g2yA7BtkzyEWDnDfIRkwSyYYgi/Q1U6QCmQkyt7AxJ1Qb9N6xOhDuXoMb/+B580uBun6acz/6W5idd/Pap16j2e8I4pBeeO7yt/n0cx9HJY/PyFpsJuA7UVhNzT3vvHBRzWT4VB5vIwNk6IBD3geqas7P/evf4F3vjue2Q6o4nDi5x8MXz9H1Nd/9zou89O3XuPvmActbLf6eYo9h3lo2g7DhlW0xbANbxrPlOhZlx9zUzGzDzNUUrqG0NcYtkbIBWyNVDdUyNiMWLWrD+Eh7Bn1gLFzk8yYhgE8tFK03dFrQhYrABtIv0LCNKU4hi3NsnH+CrYvvQmbnuPu9A2599zq+FtRYUOHW/m3+69/+X7x6+2Wcc4NGr80rSTIMIefy41kceefDFyNSDCMj1jm0Bh0OMYag+BA4eeoBfuGXf5MLFy7FMyZ9TNobMZw4s8cDD55mc3uBdULbrDg8OGD/3j0O9g853j/i6OCIdtnQHtf4VYe2PTZo7C7qOozvEd+D94jGL0KHkYCTeFzCGMWK4izMS8Nsbilcbqi3WGewRYGrSlxZYqsZdr6Fm21RLLaptvaYbe3h5tsYt0lXK8vbDQevH3D85gG+8RhToGIB4XB5yB9++Xf48mufT4UAGw8kpaPZTCBEGQ+GxrKcIu+88KhOJxOOMh5PP+WDMEF9rKH6wJmz5/mpn/klLj325FCG0jDpY7COal5RzUpmVUVVOqqqpKwKXOFihdqN5xsnCJfSLpquGdKG58NCjDM8UiYyHhhKZySzo1dJVXYIbcC3gdB4fBvwq47uqKE5bPFHLf0q4Ls+nT8xiHWIsQgWI4abRzf5k2d/n2cvf2mgu9ZajLGD45vO84vnW3KSKfq3qNGTSoBMmaGOqZGs2fmshg/K5tYOP/hPf5T3vu8H2NzYit1OPgytUGvjKXIOOk8hY5w2lgVkNM1gMjZOC+sDeMVqnHcUN3RUANFUNEgVG8nnSPoQ89xeoYtlsvj+EUvJETmCiAOx8Wf5XyO0oeOF69/lE9/5E1659b0oyDSYILcVDOPmZMzWRajNE86SLN7x8EXNQgkaJoKWFMszZPPCBKuDpiPMAucfusgz7/kgjz3+dnZ2dnGuGCbVkI8XjBXMMR897ScOUWslKCYYCIJ2PvamhbgJJC0nJKFBrNQoGAxG0yFLnwrLAeiiVQgmDRSwQ7U6NmSkLzWDoI6aI1699zJfu/ZFnr/xHZbtMmp4hgebhG3iM2WMDhOWEYbm82R573jokYjRa20HY0JpOjsoH07MvWWZY+dQdHtrl7PnznP23HlOnjjF9vYOG4sNZvN5Oj1b4pzDGpdmfMSi8HBA08cziibY2MTT+ZiW9JoEp6neCKKpRBE0WYfNHYdRuz1or2jnYwE45M6hKITe9/Shp2kajutD9lf73Fne4q3DN7l2+Dq3lzep+1QhN2mTzGT6Q+bLpHphKmOluIUhf5Rfe3oQNAxjeiep0tzFnpPaQZNzzKdd04hJDXnQdQpGxWCdw7mCoohnvatqRlXNKIsS6xyL2SbnzlyiKspxTp4YVssDVsf34mpCPM01DF/JFjFsUFxrVSzYW5zGhHzEObY37B/e4M7hm3S+p/Mtre9ofUPTNXR9S+tb2tDQ+Y7AOFc6J+6B4VTtVKiCDLPvSCd1s4IOk2tyXxiMFZbYOD02Uk/nOo9DYs2YY5WJkDVj8Rj0BJTQ9XRty3L0cUO0aYzj0UfeCd312DsSAmIsy/qQl1/7Bm27xE246dRR53l68Z6ZgsLFs2/n3O5DhK6j10g9e99y5cYLHBzfGQQSad80Dy9DkDadOgPEaQhraU+GemCe1SEyyilfK/d75BJAnsge1TvDwYRtD5MEMtBrxt31Rr5psX3U7FwNzuJJVRtjePvb38fTjz8TTTvRx7sH+7zw6ldpuxXOujQIIK1pbeBIxNdxVrQQ1PPm3cs88MB5HnzgAsHHapG1lp29Hb72nU/RtMvsNZKpjydexyXrhEWMUbbKSBSm6QkxU/nkaWop95lHeopM8tH5ASZnmmEyLUzHKbuaupviz6MzmjZKTnF+GNkqmcJZ3v3M+/mhf/YRSrH0PvZH3Lt3wJe/9bccHd+lcEWaAkNKqCvRThmmwwzjiDRnywp86Hjh8jd46PxDPHzyfOT3QXng7BmKmfD3X/0ETdeOPmg034StkjF0ODJhJ9w4b/SgtWlfjMTUqJFs/fm5R5HY09s7H51SOh3lPWSidBDUdIrjZGDqAD2jdZlJL1qeK2qM5QM/8CF+9ud+kY2ywjmhrAp67/n7L3yGV195jsrFiTHOpkOm1sQpYdbgrIkzQwqTDtjbNFMvMgArhrZrOFoecvGhx9jd2WI2K5mXBRcefoT55gZXr71G33fDyLlhNM9A6NPglnTI1UzGzMl97xsx2Qybky0/K0VuSnKQzWKihsRc7RC0jOCYdDJGkmOKMAc8Y2rQiIm1T2Mpi5KTp0/xwz/yo3zoQz/E6mBJZ1usKVGFmzfvgLS8853voHBugMo8uTGO5RxTkFmrx3snahbiIr33LPWIc7NToAFRh1Hhxz70Ed72+Nv460/9OVcuv0bT1HTBJ0HpMCltwH/JQDPJF6/Nn8plLEYGtqZuo+Dl6fMP63Snxtmbo5ADiasms8qOJDqiMJzuZ3jYOEP0iaffwY9+5Cc4deo0p8+cpTAVd2/cpu/aAZoUxRUF2ye3KMoiBQCD02A624l0ni/DV56bqkNnpqSIUGmOGw7evIN2HoksGwnCxvYmbqvg5t0b3L59ky9/5Qt89Wt/P1rzBObi5SYdosT+52FQ7uQZxhkdUTLGZMIQd8HlXN3wNYSOY+VliOKSyaiZvNdI6hCNOdm8OdVsxs///L/m0UuPs1o2rA5qDrsDRBRXmmGRkcV4ju8dDBw1sxmTzDi+M2pd6NN4H0bKF5vZw+h/gdB7XAFqLQaLBEH7QH14jD0Qdu0mJ3b3OP0Dp3nr1Re5u39jGDye4VIHAY+sRDOEiuAnICxkhz3ZpNxNkEqV5OLDdNZojnDy61byWHZNQh8jvnjOLrVBJAGVBdy+dpm93VPkhr+iNMPK1gWdMS/nPjJnvQ/zxRAsg6DzFJkhIAkKmsYWuTj3QzUGN3Qx/yBWkCD4pqM9XrF/8w12ig5mEqPyJJmgYykqnQ0YgpK8myr5Ey8izviMLkbSccLJR1e96/xDaofZ+wxmK8kb54/ZENHJDOUwCNSmUUB2cFZg08Raijnz0w+jrkztZTn5MaVp+Z/xe5loRYaznFeImDuBTPLc07SB6cQCKcxP9boUNYbUwUo89Nl3HO+/Tt/dix2yQel9JKteZXh7F6APgSBmuO90EzJ8+MG/mST0kAI8xWVHElQZh+rpmA2b4FN2rapCkJhviHkigw9Cp1D7iOpGDN3hIfX1b9D7tJyUgPFh4nwnfsOakV7muUiZzeT15MAlD5XKVaMchEj2+qlNYpKCHzZD08+sEQox41BZ4syn+KY4Wl8FegJezKDl+Rq9jiwtFmEl5TzCMIMp8303juydqEleeNJaQxTq4PAYvX/WUgl5Itf087EMVVExK+NBfuviPGgNIU26GRQcJQ8wTFjPmApVjSOHjBnppPfjp7pZEyGiz0fR0OEhjcZN6UNshteshRrPCOpg4ozPnXNpGjv2e08aRjh28Cuxp3zIcQzuaTIjb2BvuRE9YWUYn30kKUNEmiY4kqfQypCdCjr5PLM1ZwDGThpJAqhJA57Ic6Lz1uXdMUOWUKZhtpLOw0w0KCWHvc+0chQYaUSxT1iqRMeNpkRWwuEMQyGkeXXEz+JSJE12zL+f09wJAXLzzIRXD3XCoSoefYYCLgRN44sTX82hab5pDrFVCTKG0fn/abDWQGVCYDJDTwa8N6SJ5GkBQdMAb42LNjLFtqgewaRRaRNgHE755iRWVkPN6x/obtqMyKBCTqsiQ3kOGamZJ596GC/ph0dIQkynY/NRPiGOfBuOuU06ckUiLc6RoosZuTCEvLmLNNOUkU9HfuqSmerAIVMSaWhfzdwzPqxPD6gi6aM/xhgo5r9TM5WJ01zGAazxfIvJn8SWNi87znjWaJLC1cyE87pHLM79GCFpeki5dUnWEIaPnJo+z1j9j5uWmdj6VDCfp4JN9nyEhfwxV4oLGjAh8tXBRUlO/zFgZMbGgVtqOhqR3miyZ0oLHKLbrIUScwLDaoZwKmFy/qyrNIh2iDCT4MRkfWQImsL6U60JWCcbCvkw1MhO/JA0W28hGouqE+dJnq8qA39HiMdMJj5tNLARxzMbdJo0C81JEQbcylRJE0YKgicMj5bbniTVyDL+D1MjNI4QMsZEqDDD3qXangywNHxaXBBCwiMjcYKvpmR/nmmdz4WM8cJ0+m3+f2ZQWSNHaNM0PzRNKR40P1tmvNb6p2WMSf3x46cmedPJWsb7Zt8WD3SSTTFr5zSZNHGKTLRxcAwMuWxJqhub18cSgh9mwSmaNvP+NF8ue2UHRMLQkKlb+n2v42fImqTlWZBZSHnCoqQPWxjWrwyWOGhhilACwiRaGaw2cuDxeYNCkDAUXsc/a/QhCXr8uclp0mmPnWpAxcTPAhyS4BkWxqgu7lgY0qcZIoyZmkxeZbSCTN2GD7DJ957wYx3YTxJ6Ms+cbQsTTIyH9ce0ARohQTWBSH6ugT+v5zMYIEaH94xMavqxqWPiaMjqrCWQ8jvyLNLJGpO1OBIsTCsYUYTrhiHTtOgAhPGd008uziHqWnIqa0Qao2OHKrkMJyCttZjMf/O1sycnBywJ+yZeHkkhOAwfGDLFxlzf09ENDCPSIDOTkHEhYXcY+jHuP/0QbxulE+EljImiCVSwto40RiK/uFY5mITF9589ZNCKTJ0YGnCGD64ZklAjXcvQEkLU7LUJW8iQlMrGkyO9yF6ihpnsKIcjwpMTvlPjIzOh5LzInUuxszSnODXz8Um1ZaiXTmEgcfyRIzNAU6aW6PpG59SpSEj90VlrU+JGEzYZxkGnUQJjN9OaCSYBj0khxpqZjtqVD5dGLcuhf7yE934sTZmsgfn4tBkffgi9JyegZEpDRzgIIR940iGAypRwtFYdor3xHxm0OafZyBuX+XeCjrwxg7AnsceYox4iQwZTHnmpDg8qk0WabG8JRsayTp5plDlrtNWhJJYXFMMK8ojrgX+nT2mWwZwzTZx8ttpa9Do6xuk6svCyEeXihEmQI0mIoqPwp1Y7Mowx2IjXt0P2Uhi7twbcn8ou08aJv/z/AWMBiUYzdYTnAAAAJXRFWHRkYXRlOmNyZWF0ZQAyMDI2LTA0LTAxVDE2OjA4OjIxKzAwOjAw8wLSlwAAACV0RVh0ZGF0ZTptb2RpZnkAMjAyNi0wNC0wMVQxNjowODoyMSswMDowMIJfaisAAAAodEVYdGRhdGU6dGltZXN0YW1wADIwMjYtMDQtMDFUMTY6MDg6NDIrMDA6MDAizVjuAAAAAElFTkSuQmCC`;

  window.ZappOneIcons = {};
  window.ZappOneIconsRaw = {};

  for (const [key, svg] of Object.entries(rawSvgs)) {
    if (svg && svg.trim().length > 0) {
      // Data URI per uso con <img src="..."> (noChannel, nopref, ecc.)
      window.ZappOneIcons[key] = 'data:image/svg+xml;utf8,' + encodeURIComponent(svg.trim());
      // Markup SVG raw per uso inline via innerHTML (searchEmpty, dove
      // serve currentColor per ereditare il colore del tema)
      window.ZappOneIconsRaw[key] = svg.trim();
    }
  }

  window.ZappOneIcons.tastoIcon = 'data:image/png;base64,' + tastoIconBase64;

  window.ZappOneIcons.epgPlaceholder = 'data:image/svg+xml;utf8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">' +
    '<defs><linearGradient id="zp-epg-bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2e3440"/><stop offset="1" stop-color="#161922"/></linearGradient>' +
    '<linearGradient id="zp-epg-scr" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#404a5c"/><stop offset="1" stop-color="#232834"/></linearGradient></defs>' +
    '<rect width="120" height="120" fill="url(#zp-epg-bg)"/>' +
    '<path d="M42 30 L60 42 L78 30" fill="none" stroke="#5c6678" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>' +
    '<rect x="20" y="42" width="80" height="56" rx="9" fill="url(#zp-epg-scr)" stroke="#4c5566" stroke-width="2"/>' +
    '<circle cx="60" cy="70" r="15" fill="none" stroke="#a8b0be" stroke-width="2" opacity=".85"/>' +
    '<path d="M55 62 L70 70 L55 78 Z" fill="#a8b0be" opacity=".95"/>' +
    '<rect x="54" y="102" width="12" height="3" rx="1.5" fill="#4c5566"/><rect x="44" y="105" width="32" height="3" rx="1.5" fill="#3a4150"/></svg>'
  );

  window.ZappOneIcons.demoLogo = function(label, bg, fg) {
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect width="120" height="120" rx="20" fill="' + bg + '"/>' +
      '<text x="60" y="72" text-anchor="middle" font-family="Segoe UI, Roboto, sans-serif" font-size="34" font-weight="700" fill="' + fg + '">' + label + '</text></svg>'
    );
  };

  console.log('[ZappOneIcons] pronto.');
})();