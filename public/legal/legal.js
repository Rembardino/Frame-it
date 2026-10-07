// Render these small legal documents without evaluating Markdown as HTML.
const target = document.getElementById('legal-document');

function appendTextWithLinks(node, text) {
  const links = /\[([^\]]+)\]\(([^\s)]+)\)/g;
  let start = 0;
  for (const match of text.matchAll(links)) {
    node.append(document.createTextNode(text.slice(start, match.index)));
    const url = new URL(match[2], document.baseURI);
    if (['https:', 'http:', 'mailto:'].includes(url.protocol)) {
      const link = document.createElement('a');
      link.textContent = match[1];
      link.href = url.href;
      node.append(link);
    } else {
      node.append(document.createTextNode(match[1]));
    }
    start = match.index + match[0].length;
  }
  node.append(document.createTextNode(text.slice(start)));
}

try {
  const response = await fetch(target.dataset.source);
  if (!response.ok) throw new Error('Document unavailable');
  const text = await response.text();
  const nodes = document.createDocumentFragment();
  for (const block of text.split(/\r?\n\s*\r?\n/)) {
    const heading = block.match(/^(#{1,2}) (.*)$/);
    const tag = heading ? `h${heading[1].length}` : block.startsWith('> ') ? 'blockquote' : 'p';
    const node = document.createElement(tag);
    appendTextWithLinks(node, heading ? heading[2] : block.replace(/^> /, '').trim());
    if (node.textContent) nodes.append(node);
  }
  target.replaceChildren(nodes);
} catch {
  target.textContent = 'Unable to load this document. Please download the text using the link below.';
}
