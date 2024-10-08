const { convert } = require('html-to-text');
const AWS = require('aws-sdk');
const sharp = require('sharp');

// Configure AWS SDK for S3
const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION,
});

async function uploadToS3(base64Data, fileName) {
  const buffer = Buffer.from(base64Data, 'base64');
  const params = {
    Bucket: 'your-s3-bucket-name', // replace with your S3 bucket name
    Key: `images/${fileName}`, // replace with your desired key format
    Body: buffer,
    ContentEncoding: 'base64',
    ContentType: 'image/jpeg', // adjust based on your image type
  };

  const data = await s3.upload(params).promise();
  return data.Location; // returns the URL of the uploaded image
}

const customImageFormatter = async (elem, walk, builder) => {
  const src = elem.attribs.src;

  if (src.startsWith('data:image/')) {
    // Extract base64 data
    const base64Data = src.split(',')[1];
    const fileName = `image-${Date.now()}.jpg`; // generate a unique file name

    // Upload to S3
    // const imageUrl = await uploadToS3(base64Data, fileName);

    // Add the image URL to the output text
    // builder.addInline(`![Image](${imageUrl})`);

    builder.addInline("Link to the image");
  } else {
    // Handle non-base64 images (optional)
    builder.addInline(`[Image: ${src}]`);
  }
};

const options = {
  wordwrap: 130,
  formatters: {
    img: customImageFormatter,
  },
  selectors: [
    { selector: 'img', format: 'img' },
  ],
};

const html = `
<img src="data:image/png;base64,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">
<p>other text here</p>
`;

async function convertHtmlToText(html) {
  const text = await convert(html, options);
  console.log(text);
}

convertHtmlToText(html);
