import { escapeHtml, sanitizeHtml } from './Utils.js';

/**
 * Simple Markdown-to-HTML parser that supports headers, bold, italics, lists, and tables.
 */
const MAX_CACHE_SIZE = 150;
const markdownCache = new Map();

export function parseMarkdown(text) {
  if (!text) return '';
  
  if (markdownCache.has(text)) {
    return markdownCache.get(text);
  }
  
  // Evict oldest item if cache size exceeds capacity
  if (markdownCache.size >= MAX_CACHE_SIZE) {
    const firstKey = markdownCache.keys().next().value;
    if (firstKey !== undefined) {
      markdownCache.delete(firstKey);
    }
  }
  
  // Escape HTML first to prevent XSS
  let html = escapeHtml(text);
  
  // Replace headers: ###, ##, #
  html = html.replace(/^### (.*?)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.*?)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.*?)$/gm, '<h1>$1</h1>');
  
  // Bold: **text**
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  
  // Italics: *text* (but not already-consumed bold markers)
  html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
  
  // Split into lines, keep empty-line info but filter blank lines
  const rawLines = html.split('\n');
  const lines = rawLines.filter(line => line.trim() !== '');

  let result = [];
  let listStack = []; // stack of indent levels for nested lists
  
  function isSeparatorRow(line) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|') || !trimmed.endsWith('|') || trimmed.length <= 2) return false;
    const inner = trimmed.slice(1, -1);
    return /^[:\-\s\|]+$/.test(inner) && inner.includes('-');
  }
  
  function parseTableCells(line) {
    const trimmed = line.trim();
    return trimmed.slice(1, -1).split('|').map(cell => cell.trim());
  }
  
  function parseAlignments(line) {
    return parseTableCells(line).map(cell => {
      const alignLeft = cell.startsWith(':');
      const alignRight = cell.endsWith(':');
      if (alignLeft && alignRight) return 'center';
      if (alignRight) return 'right';
      if (alignLeft) return 'left';
      return '';
    });
  }
  
  function generateTableHtml(headers, rows, alignments) {
    let tableHtml = '<table class="md-table">';
    tableHtml += '<thead><tr>';
    headers.forEach((header, idx) => {
      const align = alignments[idx] ? ` style="text-align: ${alignments[idx]}"` : '';
      tableHtml += `<th${align}>${header}</th>`;
    });
    tableHtml += '</tr></thead><tbody>';
    rows.forEach(row => {
      tableHtml += '<tr>';
      for (let idx = 0; idx < headers.length; idx++) {
        const cell = row[idx] !== undefined ? row[idx] : '';
        const align = alignments[idx] ? ` style="text-align: ${alignments[idx]}"` : '';
        tableHtml += `<td${align}>${cell}</td>`;
      }
      tableHtml += '</tr>';
    });
    tableHtml += '</tbody></table>';
    return tableHtml;
  }

  function closeListsToDepth(targetDepth) {
    while (listStack.length > targetDepth) {
      result.push('</li></ul>');
      listStack.pop();
    }
  }

  function closeAllLists() {
    closeListsToDepth(0);
  }

  // Detect list line: returns { indent, content } or null
  function parseListLine(line) {
    const match = line.match(/^(\s*)([-*])\s+(.*)/);
    if (!match) return null;
    return { indent: match[1].length, content: match[3].trim() };
  }
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();
    
    // Check if it's a table
    if (trimmedLine.startsWith('|') && trimmedLine.endsWith('|')) {
      if (i + 1 < lines.length && isSeparatorRow(lines[i + 1])) {
        closeAllLists();
        
        const headers = parseTableCells(line);
        const alignments = parseAlignments(lines[i + 1]);
        const rows = [];
        
        let j = i + 2;
        while (j < lines.length && lines[j].trim().startsWith('|') && lines[j].trim().endsWith('|')) {
          if (isSeparatorRow(lines[j])) break;
          rows.push(parseTableCells(lines[j]));
          j++;
        }
        
        result.push(generateTableHtml(headers, rows, alignments));
        i = j - 1;
        continue;
      }
    }
    
    const listItem = parseListLine(line);
    if (listItem) {
      if (listStack.length === 0) {
        // Start first list
        result.push('<ul>');
        listStack.push(listItem.indent);
        result.push(`<li>${listItem.content}`);
      } else {
        const currentIndent = listStack[listStack.length - 1];
        if (listItem.indent > currentIndent) {
          // Deeper: open nested list (don't close previous <li>)
          result.push('<ul>');
          listStack.push(listItem.indent);
          result.push(`<li>${listItem.content}`);
        } else if (listItem.indent < currentIndent) {
          // Shallower: close nested lists back to matching depth
          while (listStack.length > 1 && listStack[listStack.length - 1] > listItem.indent) {
            result.push('</li></ul>');
            listStack.pop();
          }
          result.push('</li>');
          result.push(`<li>${listItem.content}`);
        } else {
          // Same level
          result.push('</li>');
          result.push(`<li>${listItem.content}`);
        }
      }
    } else {
      closeAllLists();
      if (trimmedLine.startsWith('<h') || trimmedLine.startsWith('<table')) {
        result.push(trimmedLine);
      } else {
        result.push(`<p>${trimmedLine}</p>`);
      }
    }
  }
  
  let parsedHtml = sanitizeHtml(result.join('\n'));
  parsedHtml = fixTellMeAboutYourselfPitches(parsedHtml);
  markdownCache.set(text, parsedHtml);
  return parsedHtml;
}

/**
 * Transforms bullet-point list items under the "Tell Me About Yourself" pitches section
 * into bold titles and paragraph text instead of <ul><li> list items.
 */
function fixTellMeAboutYourselfPitches(html) {
  if (!html || !/Tell\s+Me\s+About\s+Yourself/i.test(html)) return html;

  // Split HTML into blocks around heading tags (<h1..6>) or paragraph tags (<p>)
  const blockRegex = /(<(?:h[1-6]|p)[^>]*>[\s\S]*?<\/(?:h[1-6]|p)>)/gi;
  const parts = html.split(blockRegex);

  let inTargetSection = false;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (/^<(?:h[1-6]|p)/i.test(part)) {
      if (/Tell\s+Me\s+About\s+Yourself/i.test(part)) {
        inTargetSection = true;
      } else if (/^<h[1-6]/i.test(part)) {
        inTargetSection = false;
      }
    } else if (inTargetSection) {
      parts[i] = part.replace(/<ul>([\s\S]*?)<\/ul>/gi, (match, ulContent) => {
        const liRegex = /<li>([\s\S]*?)<\/li>/gi;
        let resultHtml = '';
        let liMatch;

        while ((liMatch = liRegex.exec(ulContent)) !== null) {
          const itemText = liMatch[1].trim();

          // Match strong title at the start of the li item: <strong>Title:?</strong> Body
          const strongMatch = itemText.match(/^<strong>([\s\S]*?)<\/strong>\s*:?\s*([\s\S]*)$/i);
          if (strongMatch) {
            let title = strongMatch[1].replace(/:\s*$/, '').trim();
            let body = strongMatch[2].trim();

            if (title) {
              resultHtml += `<p><strong>${title}</strong></p>\n`;
            }
            if (body) {
              resultHtml += `<p>${body}</p>\n`;
            }
          } else {
            if (itemText) {
              resultHtml += `<p>${itemText}</p>\n`;
            }
          }
        }

        return resultHtml || match;
      });
    }
  }

  return parts.join('');
}
