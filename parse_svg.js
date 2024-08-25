const { convert } = require('html-to-text');
const AWS = require('aws-sdk');
const sharp = require('sharp');

// Configure AWS SDK for S3
const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION,
});

async function uploadToS3(buffer, fileName) {
  const params = {
    Bucket: 'your-s3-bucket-name', // replace with your S3 bucket name
    Key: `images/${fileName}`, // replace with your desired key format
    Body: buffer,
    ContentType: 'image/png', // PNG format
  };

  const data = await s3.upload(params).promise();
  return data.Location; // returns the URL of the uploaded image
}

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

const customSvgFormatter = async (elem, walk, builder) => {
  try {
    // Manually serialize the SVG element and its children
    const svgXml = serializeElement(elem);

    console.log('SVG XML:', svgXml);

    if (!svgXml) {
      throw new Error('SVG serialization resulted in an empty string');
    }

    // Convert SVG XML string to PNG using Sharp
    // const buffer = await sharp(Buffer.from(svgXml))
    //   .png()
    //   .toBuffer();

    // const fileName = `svg-image-${Date.now()}.png`; // generate a unique file name

    // Upload to S3
    // const imageUrl = await uploadToS3(buffer, fileName);

    // Add the image URL to the output text
    // builder.addInline(`![SVG Image](${imageUrl})`);

    builder.addInline("Link to the SVG image");
  } catch (error) {
    console.error('Error processing SVG:', error);
    builder.addInline('[Error processing SVG]');
  }
};

const options = {
  wordwrap: 130,
  formatters: {
    svg: customSvgFormatter,
  },
  selectors: [
    { selector: 'svg', format: 'svg' },
  ],
};

const html = `
  <p>This some text</p>
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
    <circle cx="50" cy="50" r="40" stroke="black" stroke-width="3" fill="red" />
    <circle cx="50" cy="50" r="40" stroke="black" stroke-width="3" fill="red" />
  </svg>
  <p>This some text</p>
`;

async function convertHtmlToText(html) {
  const text = await convert(html, options);
  console.log(text);
}

convertHtmlToText(html);