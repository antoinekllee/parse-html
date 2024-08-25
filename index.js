const { convert } = require("html-to-text");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const sharp = require("sharp");
require ("dotenv").config();

const s3Client = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
});

async function uploadToS3(buffer, fileName, contentType) {
    const params = {
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: `compsci/${fileName}`, // make a folder called compsci
        Body: buffer,
        ContentType: contentType,
    };

    const command = new PutObjectCommand(params);
    const data = await s3Client.send(command);
    return `https://${params.Bucket}.s3.${process.env.AWS_REGION}.amazonaws.com/${params.Key}`;
}

function serializeElement(element) {
    if (element.type === "text") {
        return element.data;
    }

    const tag = element.name;
    const attributes = Object.entries(element.attribs)
        .map(([key, value]) => `${key}="${value}"`)
        .join(" ");

    const children = element.children.map(serializeElement).join("");

    return `<${tag} ${attributes}>${children}</${tag}>`;
}

const customImageFormatter = async (elem, walk, builder) => 
{
    const src = elem.attribs.src;

    if (src.startsWith("data:image/")) 
    {
        const base64Data = src.split(",")[1];
        const buffer = Buffer.from(base64Data, "base64");
        const fileName = `image-${Date.now()}.jpg`; // generate a unique file name

        const imageUrl = await uploadToS3(buffer, fileName, "image/jpeg");
        builder.addInline(`![Image](${imageUrl})`);

        // builder.addInline("Link to the image");
    } else {
        // Handle non-base64 images (optional)
        builder.addInline(`[Image: ${src}]`);
    }
};

const customSvgFormatter = async (elem, walk, builder) => {
    try {
        // Manually serialize the SVG element and its children
        const svgXml = serializeElement(elem);

        if (!svgXml) {
            throw new Error("SVG serialization resulted in an empty string");
        }

        const buffer = await sharp(Buffer.from(svgXml))
          .png()
          .toBuffer();
        const fileName = `svg-image-${Date.now()}.png`; // generate a unique file name
        const imageUrl = await uploadToS3(buffer, fileName, 'image/png');
        builder.addInline(`![SVG Image](${imageUrl})`);

        builder.addInline("Link to the SVG image");
    } catch (error) {
        console.error("Error processing SVG:", error);
        builder.addInline("[Error processing SVG]");
    }
};

const customTableFormatter = (elem, walk, builder) => {
    const rows = elem.children.filter((child) => child.name === "tr");

    rows.forEach((row) => {
        const cells = row.children.filter(
            (cell) => cell.name === "td" || cell.name === "th"
        );
        const cellText = cells.map((cell) => {
            const cellContent = cell.children
                .map(serializeElement)
                .join("")
                .trim();
            return cellContent;
        });

        // Open a block for each row
        builder.openBlock();

        // Add the formatted row as inline text
        builder.addInline(cellText.join(" | "));

        // Close the block, which adds a line break
        builder.closeBlock();
    });
};

const options = {
    wordwrap: 130,
    formatters: {
        img: customImageFormatter,
        svg: customSvgFormatter,
        table: customTableFormatter,
    },
    selectors: [
        { selector: "img", format: "img" },
        { selector: "svg", format: "svg" },
        { selector: "table", format: "table" },
    ],
};

const html = ``;

async function convertHtmlToText(html) {
    const text = await convert(html, options);
    console.log(text);
}

convertHtmlToText(html);
