const { convert } = require('html-to-text');

// Custom formatter for the table element
const customTableFormatter = (elem, walk, builder) => {
  const rows = elem.children.filter(child => child.name === 'tr');

  rows.forEach(row => {
    const cells = row.children.filter(cell => cell.name === 'td' || cell.name === 'th');
    const cellText = cells.map(cell => {
      const cellContent = cell.children.map(serializeElement).join('').trim();
      return cellContent;
    });

    // Open a block for each row
    builder.openBlock();

    // Add the formatted row as inline text
    builder.addInline(cellText.join(' | '));

    // Close the block, which adds a line break
    builder.closeBlock();
  });
};

// Helper function to serialize elements (same as before)
function serializeElement(element) {
  if (element.type === 'text') {
    return element.data;
  }

  const tag = element.name;
  const attributes = Object.entries(element.attribs)
    .map(([key, value]) => `${key}="${value}"`)
    .join(' ');

  const children = element.children
    .map(serializeElement)
    .join('');

  return `<${tag} ${attributes}>${children}</${tag}>`;
}

const options = {
  wordwrap: 130,
  formatters: {
    table: customTableFormatter,
  },
  selectors: [
    { selector: 'table', format: 'table' },
  ],
};

const html = `
  <p>Here is a simple table:</p>
  <table>
    <tr>
      <th>Name</th>
      <th>Age</th>
      <th>City</th>
    </tr>
    <tr>
      <td>John Doe</td>
      <td>30</td>
      <td>New York</td>
    </tr>
    <tr>
      <td>Jane Smith</td>
      <td>25</td>
      <td>Los Angeles</td>
    </tr>
  </table>
`;

async function convertHtmlToText(html) {
  const text = await convert(html, options);
  console.log(text);
}

convertHtmlToText(html);