// ================================================================
//  A07-epg-parser-worker.js — VERSIONE OTTIMIZZATA (corretta)
//  Single-pass: una sola scansione del testo, un solo passaggio
//  su ogni blocco <programme>. Niente array intermedio di blocchi.
//  Stessa struttura di output, stessa semantica del parser originale.
//
//  [VARIANTE A] Ogni programma include startMs/endMs numerici; i
//  programs sono ordinati per startMs (prerequisito per binary search
//  in buildTimelineContent/repositionTimelineContent).
// ================================================================

// Regex compilate una sola volta
const ENTITY_RE  = /&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g;
const ATTR_REGEX = /([a-zA-Z_:][a-zA-Z0-9_:.\-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

function decodeEntities(str) {
  if (!str || str.indexOf('&') === -1) return str;
  ENTITY_RE.lastIndex = 0;
  return str.replace(ENTITY_RE, function (match, ent) {
    if (ent === 'amp')  return '&';
    if (ent === 'lt')   return '<';
    if (ent === 'gt')   return '>';
    if (ent === 'quot') return '"';
    if (ent === 'apos') return "'";
    if (ent.charCodeAt(0) === 35) {            // '#'
      const code = (ent.charAt(1) === 'x' || ent.charAt(1) === 'X')
        ? parseInt(ent.substring(2), 16)
        : parseInt(ent.substring(1), 10);
      if (!isNaN(code) && code >= 0 && code <= 0x10FFFF) {
        return String.fromCodePoint(code);
      }
    }
    return match;
  });
}

function parseAttrs(attrsStr) {
  const attrs = {};
  ATTR_REGEX.lastIndex = 0;
  let m;
  while ((m = ATTR_REGEX.exec(attrsStr)) !== null) {
    attrs[m[1]] = decodeEntities(m[2] !== undefined ? m[2] : m[3]);
  }
  return attrs;
}

// Terminatori validi dopo un nome di tag: ' ', '>', '/', '\t', '\n', '\r'
function isTagBoundary(c) {
  return c === 32 || c === 62 || c === 47 || c === 9 || c === 10 || c === 13;
}

function findTagEnd(str, start) {
  let inSingle = false, inDouble = false;
  for (let i = start; i < str.length; i++) {
    const c = str.charCodeAt(i);
    if (c === 34) inDouble = !inDouble;
    else if (c === 39) inSingle = !inSingle;
    else if (c === 62 && !inSingle && !inDouble) return i;
  }
  return -1;
}

// Estrae il testo tra start e end (già interni al tag).
// Gestisce CDATA (verificando ANCHE la chiusura) ed entità.
function extractText(s, start, end) {
  // Skip whitespace senza .trim() (che alloca)
  while (start < end && s.charCodeAt(start) <= 32) start++;
  while (end > start && s.charCodeAt(end - 1) <= 32) end--;
  if (start >= end) return '';

  // CDATA: verifica inizio E fine
  if (end - start >= 12 &&
      s.startsWith('<![CDATA[', start) &&
      s.charCodeAt(end - 3) === 93 &&   // ']'
      s.charCodeAt(end - 2) === 93 &&   // ']'
      s.charCodeAt(end - 1) === 62) {   // '>'
    return s.substring(start + 9, end - 3);
  }

  // Entità (evita la seconda scansione quando non c'è '&')
  const amp = s.indexOf('&', start);
  if (amp !== -1 && amp < end) {
    return decodeEntities(s.substring(start, end));
  }
  return s.substring(start, end);
}

// Estrae TUTTI i sotto-tag di un blocco <programme> in un solo passaggio.
// Per ciascun campo viene presa SOLO la prima occorrenza (sentinella null),
// per compatibilità col vecchio getTextContent/getAttrValue.
function parseProgrammeInner(inner) {
  let title = null, subtitle = null, description = null, category = null, poster = null;
  const len = inner.length;
  let pos = 0;

  while (pos < len) {
    const lt = inner.indexOf('<', pos);
    if (lt === -1) break;
    const gt = findTagEnd(inner, lt);
    if (gt === -1) break;

    let nameEnd = lt + 1;
    while (nameEnd < gt && !isTagBoundary(inner.charCodeAt(nameEnd))) nameEnd++;
    const tagName     = inner.substring(lt + 1, nameEnd);
    const selfClosing = inner.charCodeAt(gt - 1) === 47;

    let contentStart = gt + 1;
    let contentEnd;
    let nextPos;

    if (selfClosing) {
      contentEnd = gt;
      nextPos    = gt + 1;
    } else {
      const closeTag = '</' + tagName + '>';
      const closeIdx = inner.indexOf(closeTag, gt + 1);
      if (closeIdx === -1) { pos = gt + 1; continue; }
      contentEnd = closeIdx;
      nextPos    = closeIdx + closeTag.length;
    }

    switch (tagName) {
      case 'title':
        if (title === null) title = extractText(inner, contentStart, contentEnd);
        break;
      case 'sub-title':
        if (subtitle === null) subtitle = extractText(inner, contentStart, contentEnd);
        break;
      case 'desc':
        if (description === null) description = extractText(inner, contentStart, contentEnd);
        break;
      case 'category':
        if (category === null) category = extractText(inner, contentStart, contentEnd);
        break;
      case 'icon':
        if (poster === null) {
          const attrs = parseAttrs(inner.substring(nameEnd, gt));
          poster = attrs.src || '';
        }
        break;
    }

    pos = nextPos;
  }

  return {
    title:       title       || '',
    subtitle:    subtitle    || '',
    description: description || '',
    category:    category    || '',
    poster:      poster      || ''
  };
}

function parseXMLTVDate(xmltvDate) {
  if (!xmltvDate || typeof xmltvDate !== 'string' || xmltvDate.length < 14) {
    return null;
  }

  const year   = parseInt(xmltvDate.substring(0, 4),  10);
  const month  = parseInt(xmltvDate.substring(4, 6),  10) - 1;
  const day    = parseInt(xmltvDate.substring(6, 8),  10);
  const hour   = parseInt(xmltvDate.substring(8, 10), 10);
  const minute = parseInt(xmltvDate.substring(10, 12), 10);
  const second = parseInt(xmltvDate.substring(12, 14), 10);

  if (isNaN(year) || isNaN(month) || isNaN(day) ||
      isNaN(hour) || isNaN(minute) || isNaN(second)) {
    return null;
  }

  const date = new Date(Date.UTC(year, month, day, hour, minute, second));
  if (isNaN(date.getTime())) return null;

  const tz = xmltvDate.substring(14).trim().replace(/:/g, '');
  if (tz && tz.length >= 5) {
    const sign = tz.charAt(0);
    const oh   = parseInt(tz.substring(1, 3), 10);
    const om   = parseInt(tz.substring(3, 5), 10);
    if (!isNaN(oh) && !isNaN(om)) {
      const off = (oh * 60 + om) * 60000;
      if (sign === '+')      date.setTime(date.getTime() - off);
      else if (sign === '-') date.setTime(date.getTime() + off);
    }
  }

  return date;
}

// Estrae name e logo da un blocco <channel>.
// Loop per ciascuno per saltare eventuali falsi prefissi (es. <display-namex>),
// come faceva il vecchio getTextContent/getAttrValue con boundary check.
function parseChannelInner(inner) {
  let name = '';
  let logo = '';
  let pos  = 0;

  // display-name — prima occorrenza con boundary valido
  while (pos < inner.length) {
    const dnLt = inner.indexOf('<display-name', pos);
    if (dnLt === -1) break;
    const dnAfter = dnLt + 13;                         // '<display-name'.length
    if (isTagBoundary(inner.charCodeAt(dnAfter))) {
      const dnGt = findTagEnd(inner, dnLt);
      if (dnGt !== -1 && inner.charCodeAt(dnGt - 1) !== 47) {  // non self-closing
        const dnClose = inner.indexOf('</display-name>', dnGt + 1);
        if (dnClose !== -1) name = extractText(inner, dnGt + 1, dnClose);
      }
      break;
    }
    pos = dnAfter;
  }

  pos = 0;
  // icon — prima occorrenza con boundary valido
  while (pos < inner.length) {
    const icLt = inner.indexOf('<icon', pos);
    if (icLt === -1) break;
    const icAfter = icLt + 5;                          // '<icon'.length
    if (isTagBoundary(inner.charCodeAt(icAfter))) {
      const icGt = findTagEnd(inner, icLt);
      if (icGt !== -1) {
        const iconAttrs = parseAttrs(inner.substring(icAfter, icGt));
        logo = iconAttrs.src || '';
      }
      break;
    }
    pos = icAfter;
  }

  return { name, logo };
}

function parseXMLTVText(xmlText) {
  const channels            = [];
  const programmesByChannel = new Map();
  const len                 = xmlText.length;
  let   pos                 = 0;

  // ── UN SOLO PASSAGGIO su tutto il testo ──
  while (pos < len) {
    const lt = xmlText.indexOf('<', pos);
    if (lt === -1) break;

    const next = xmlText.charCodeAt(lt + 1);
    if (next === 33 || next === 63) {              // '<!' o '<?'
      const gt = xmlText.indexOf('>', lt);
      if (gt === -1) break;
      pos = gt + 1;
      continue;
    }
    if (next === 47) { pos = lt + 1; continue; }   // '</...'

    const gt = findTagEnd(xmlText, lt);
    if (gt === -1) break;

    let nameEnd = lt + 1;
    while (nameEnd < gt && !isTagBoundary(xmlText.charCodeAt(nameEnd))) nameEnd++;
    const tagName = xmlText.substring(lt + 1, nameEnd);

    if (tagName === 'channel' || tagName === 'programme') {
      // Skip self-closing (<channel/>, <programme/>)
      if (xmlText.charCodeAt(gt - 1) === 47) { pos = gt + 1; continue; }

      const closeTag = '</' + tagName + '>';
      const closeIdx = xmlText.indexOf(closeTag, gt + 1);
      if (closeIdx === -1) break;

      const attrsStr = xmlText.substring(nameEnd, gt);
      const inner    = xmlText.substring(gt + 1, closeIdx);

      if (tagName === 'channel') {
        const a = parseAttrs(attrsStr);
        if (a.id) {
          const ch = parseChannelInner(inner);
          channels.push({ id: a.id, name: ch.name, logo: ch.logo });
        }
      } else {
        const a = parseAttrs(attrsStr);
        if (a.channel) {
          const start = parseXMLTVDate(a.start);
          const end   = parseXMLTVDate(a.stop);
          if (start && end) {
            const duration = end.getTime() - start.getTime();
            if (duration > 0 && duration <= 43200000) {
              const p    = parseProgrammeInner(inner);
              let   list = programmesByChannel.get(a.channel);
              if (!list) { list = []; programmesByChannel.set(a.channel, list); }
              list.push({
                title:       p.title,
                subtitle:    p.subtitle,
                description: p.description,
                start:       start.toISOString(),
                end:         end.toISOString(),
                startMs:     start.getTime(),
                endMs:       end.getTime(),
                category:    p.category,
                poster:      p.poster
              });
            }
          }
        }
      }

      pos = closeIdx + closeTag.length;
    } else {
      pos = gt + 1;
    }
  }

  // ── Assemblaggio finale (identico all'originale) ──
  const result = [];
  for (let i = 0; i < channels.length; i++) {
    const ch    = channels[i];
    const progs = programmesByChannel.get(ch.id) || [];
    if (progs.length > 1) progs.sort((a, b) => a.startMs - b.startMs);
    result.push({ id: ch.id, name: ch.name, logo: ch.logo, programs: progs });
  }
  return result;
}

self.onmessage = function (e) {
  try {
    const xmlText = e.data && e.data.xml;
    if (!xmlText || typeof xmlText !== 'string') {
      self.postMessage({ ok: false, error: 'Input XML mancante o non valido' });
      return;
    }
    const data = parseXMLTVText(xmlText);
    self.postMessage({ ok: true, data: data });
  } catch (err) {
    self.postMessage({ ok: false, error: (err && err.message) || String(err) });
  }
};