// ================================================================
//  epg-parser-worker.js
//  Parser XMLTV eseguito in un Web Worker.
//  IN:  { xml: "<tv>...</tv>" }
//  OUT: { ok: true, data: [...] }  oppure  { ok: false, error: "..." }
//  Struttura output identica a parseXMLTV() di epg.js.
// ================================================================

function decodeEntities(str) {
  if (!str || str.indexOf('&') === -1) return str;
  return str.replace(
    /&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g,
    function (match, ent) {
      if (ent === 'amp') return '&';
      if (ent === 'lt')  return '<';
      if (ent === 'gt')  return '>';
      if (ent === 'quot') return '"';
      if (ent === 'apos') return "'";
      if (ent.charAt(0) === '#') {
        const code = (ent.charAt(1) === 'x' || ent.charAt(1) === 'X')
          ? parseInt(ent.substring(2), 16)
          : parseInt(ent.substring(1), 10);
        if (!isNaN(code) && code >= 0 && code <= 0x10FFFF) {
          return String.fromCodePoint(code);
        }
      }
      return match;
    }
  );
}

const ATTR_REGEX = /([a-zA-Z_:][a-zA-Z0-9_:.\-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

function parseAttrs(attrsStr) {
  const attrs = {};
  ATTR_REGEX.lastIndex = 0;
  let m;
  while ((m = ATTR_REGEX.exec(attrsStr)) !== null) {
    const val = (m[2] !== undefined) ? m[2] : m[3];
    attrs[m[1]] = decodeEntities(val);
  }
  return attrs;
}

function findTagEnd(str, start) {
  let inSingle = false;
  let inDouble = false;
  for (let i = start; i < str.length; i++) {
    const c = str.charCodeAt(i);
    if (c === 34) inDouble = !inDouble;
    else if (c === 39) inSingle = !inSingle;
    else if (c === 62 && !inSingle && !inDouble) return i;
  }
  return -1;
}

function extractBlocks(text, tagName) {
  const blocks = [];
  const openMarker  = '<' + tagName;
  const closeMarker = '</' + tagName + '>';
  let pos = 0;

  while (true) {
    const open = text.indexOf(openMarker, pos);
    if (open === -1) break;

    const afterName = text.charCodeAt(open + openMarker.length);
    if (afterName !== 32 && afterName !== 62 && afterName !== 47 &&
        afterName !== 9  && afterName !== 10 && afterName !== 13) {
      pos = open + openMarker.length;
      continue;
    }

    const openEnd = findTagEnd(text, open);
    if (openEnd === -1) break;

    if (text.charCodeAt(openEnd - 1) === 47) {
      pos = openEnd + 1;
      continue;
    }

    const close = text.indexOf(closeMarker, openEnd);
    if (close === -1) break;

    blocks.push({
      attrs: text.substring(open + openMarker.length, openEnd),
      inner: text.substring(openEnd + 1, close)
    });

    pos = close + closeMarker.length;
  }

  return blocks;
}

function getTextContent(inner, tagName) {
  const openMarker  = '<' + tagName;
  const closeMarker = '</' + tagName + '>';
  let pos = 0;

  while (true) {
    const open = inner.indexOf(openMarker, pos);
    if (open === -1) return null;

    const afterName = inner.charCodeAt(open + openMarker.length);
    if (afterName !== 32 && afterName !== 62 && afterName !== 47 &&
        afterName !== 9  && afterName !== 10 && afterName !== 13) {
      pos = open + openMarker.length;
      continue;
    }

    const openEnd = findTagEnd(inner, open);
    if (openEnd === -1) return null;

    if (inner.charCodeAt(openEnd - 1) === 47) return '';

    const close = inner.indexOf(closeMarker, openEnd);
    if (close === -1) return null;

    let content = inner.substring(openEnd + 1, close).trim();

    if (content.startsWith('<![CDATA[') && content.endsWith(']]>')) {
      return content.substring(9, content.length - 3);
    }

    return decodeEntities(content);
  }
}

function getAttrValue(inner, tagName, attrName) {
  const openMarker = '<' + tagName;
  let pos = 0;

  while (true) {
    const open = inner.indexOf(openMarker, pos);
    if (open === -1) return null;

    const afterName = inner.charCodeAt(open + openMarker.length);
    if (afterName !== 32 && afterName !== 62 && afterName !== 47) {
      pos = open + openMarker.length;
      continue;
    }

    const openEnd = findTagEnd(inner, open);
    if (openEnd === -1) return null;

    const attrs = parseAttrs(inner.substring(open + openMarker.length, openEnd));
    return attrs[attrName] || null;
  }
}

function parseXMLTVDate(xmltvDate) {
  if (!xmltvDate || typeof xmltvDate !== 'string' || xmltvDate.length < 14) {
    return null;
  }

  const year   = parseInt(xmltvDate.substring(0, 4), 10);
  const month  = parseInt(xmltvDate.substring(4, 6), 10) - 1;
  const day    = parseInt(xmltvDate.substring(6, 8), 10);
  const hour   = parseInt(xmltvDate.substring(8, 10), 10);
  const minute = parseInt(xmltvDate.substring(10, 12), 10);
  const second = parseInt(xmltvDate.substring(12, 14), 10);

  if (isNaN(year) || isNaN(month) || isNaN(day) ||
      isNaN(hour) || isNaN(minute) || isNaN(second)) {
    return null;
  }

  const date = new Date(Date.UTC(year, month, day, hour, minute, second));
  if (isNaN(date.getTime())) return null;

  const tzOffset = xmltvDate.substring(15).replace(':', '');
  if (tzOffset && tzOffset.length >= 5) {
    const sign = tzOffset.charAt(0);
    const offsetHours   = parseInt(tzOffset.substring(1, 3), 10);
    const offsetMinutes = parseInt(tzOffset.substring(3, 5), 10);
    if (!isNaN(offsetHours) && !isNaN(offsetMinutes)) {
      const offsetMs = (offsetHours * 60 + offsetMinutes) * 60000;
      if (sign === '+') date.setTime(date.getTime() - offsetMs);
      else if (sign === '-') date.setTime(date.getTime() + offsetMs);
    }
  }

  return date;
}

function parseChannelBlock(attrsStr, inner) {
  try {
    const attrs = parseAttrs(attrsStr);
    if (!attrs.id) return null;
    return {
      id:   attrs.id,
      name: getTextContent(inner, 'display-name') || '',
      logo: getAttrValue(inner, 'icon', 'src') || ''
    };
  } catch (e) {
    return null;
  }
}

function parseProgrammeBlock(attrsStr, inner) {
  try {
    const attrs = parseAttrs(attrsStr);
    if (!attrs.channel) return null;

    const start = parseXMLTVDate(attrs.start);
    const end   = parseXMLTVDate(attrs.stop);
    if (!start || !end) return null;

    const duration = end.getTime() - start.getTime();
    if (duration <= 0 || duration > 43200000) return null;

    return {
      channel:     attrs.channel,
      title:       getTextContent(inner, 'title')       || '',
      subtitle:    getTextContent(inner, 'sub-title')   || '',
      description: getTextContent(inner, 'desc')        || '',
      category:    getTextContent(inner, 'category')    || '',
      poster:      getAttrValue(inner, 'icon', 'src')   || '',
      start:       start,
      end:         end
    };
  } catch (e) {
    return null;
  }
}

function parseXMLTVText(xmlText) {
  const channelBlocks   = extractBlocks(xmlText, 'channel');
  const programmeBlocks = extractBlocks(xmlText, 'programme');

  const channels = [];
  for (let i = 0; i < channelBlocks.length; i++) {
    const ch = parseChannelBlock(channelBlocks[i].attrs, channelBlocks[i].inner);
    if (ch) channels.push(ch);
  }

  const programmes = [];
  for (let i = 0; i < programmeBlocks.length; i++) {
    const p = parseProgrammeBlock(programmeBlocks[i].attrs, programmeBlocks[i].inner);
    if (p) programmes.push(p);
  }

  const programmesByChannel = new Map();
  for (let i = 0; i < programmes.length; i++) {
    const p = programmes[i];
    let list = programmesByChannel.get(p.channel);
    if (!list) { list = []; programmesByChannel.set(p.channel, list); }
    list.push(p);
  }

  const result = [];
  for (let i = 0; i < channels.length; i++) {
    const ch = channels[i];
    const progs = programmesByChannel.get(ch.id) || [];
    const converted = new Array(progs.length);
    for (let j = 0; j < progs.length; j++) {
      const p = progs[j];
      converted[j] = {
        title:       p.title,
        subtitle:    p.subtitle,
        description: p.description,
        start:       p.start.toISOString(),
        end:         p.end.toISOString(),
        category:    p.category,
        poster:      p.poster
      };
    }
    result.push({
      id:       ch.id,
      name:     ch.name,
      logo:     ch.logo,
      programs: converted
    });
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