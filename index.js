const { convert } = require("html-to-text");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const sharp = require("sharp");
require("dotenv").config();

// Your HTML content goes here
const html = ``;

const serializeElement = (element) => {
    if (element.type === "text") {
        return element.data;
    }

    const tag = element.name;
    let attributes = "";
    
    if (element.attribs && Object.keys(element.attribs).length > 0) {
        attributes = Object.entries(element.attribs)
            .map(([key, value]) => `${key}="${value}"`)
            .join(" ");
        attributes = ` ${attributes}`; // Add a space before attributes if they exist
    }

    const children = element.children ? element.children.map(serializeElement).join("") : "";

    return `<${tag}${attributes}>${children}</${tag}>`;
};

const addWithLineBreaks = (content, builder) => {
    const lines = content.split("\n");

    lines.forEach((line) => {
        builder.openBlock();
        builder.addInline(line);
        builder.closeBlock();
    });
};

const customImageFormatter = (elem, walk, builder) => {
    const src = elem.attribs.src;

    if (src.startsWith("data:image/")) {
        const base64Data = src.split(",")[1];

        addWithLineBreaks(
            `<<BASE64_START>>\n${base64Data}\n<<BASE64_END>>`,
            builder
        );
    } else {
        builder.addInline(`[Image: ${src}]`);
    }
};

const customSvgFormatter = (elem, walk, builder) => {
    const svgXml = serializeElement(elem);

    addWithLineBreaks(`<<SVG_START>>\n${svgXml}\n<<SVG_END>>`, builder);
};

const customTableFormatter = (elem, walk, builder) => {
    // Function to extract text from a cell, handling both simple and complex cases
    const getCellText = (cell) => {
        if (cell.children.length === 1 && cell.children[0].type === 'text') {
            // Simple case: direct text content
            return cell.children[0].data.trim();
        } else {
            // Complex case: nested structure
            const pTag = cell.children.find(child => child.name === 'p');
            if (pTag) {
                const spanTag = pTag.children.find(child => child.name === 'span');
                if (spanTag && spanTag.children.length > 0) {
                    return spanTag.children[0].data.trim();
                }
            }
            // If we can't find the expected structure, try to get any text content
            return cell.children.map(child => {
                if (child.type === 'text') return child.data;
                if (child.children) return getCellText(child);
                return '';
            }).join('').trim();
        }
    };

    // Get all rows, whether they're direct children or within a tbody
    const rows = elem.name === 'table' && elem.children.find(child => child.name === 'tbody')
        ? elem.children.find(child => child.name === 'tbody').children.filter(child => child.name === 'tr')
        : elem.children.filter(child => child.name === 'tr');

    rows.forEach((row) => {
        const cells = row.children.filter(
            (cell) => cell.name === 'td' || cell.name === 'th'
        );
        const cellText = cells.map(getCellText);

        builder.openBlock();
        builder.addInline(cellText.join(" | "));
        builder.closeBlock();
    });
};

const options = {
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
        Key: `compsci/${fileName}`,
        Body: buffer,
        ContentType: contentType,
    };

    const command = new PutObjectCommand(params);
    await s3Client.send(command);
    return `https://${params.Bucket}.s3.${process.env.AWS_REGION}.amazonaws.com/${params.Key}`;
}

async function processAndReplace(content) {
    const base64Pattern = /<<BASE64_START>>\n(.*?)\n<<BASE64_END>>/gs;
    const svgPattern = /<<SVG_START>>\n(.*?)\n<<SVG_END>>/gs;

    const base64Replacements = [];
    const svgReplacements = [];

    const timestamp = Date.now();
    let base64Counter = 0;
    let svgCounter = 0;

    // Replace base64 images
    content = content.replace(base64Pattern, (match, p1) => {
        const buffer = Buffer.from(p1, "base64");
        const fileName = `image-${timestamp}-${base64Counter++}.png`;
        base64Replacements.push({
            fileName,
            uploadPromise: uploadToS3(buffer, fileName, "image/png"),
        });
        return `<<BASE64_URL:${fileName}>>`;
    });

    // Replace SVG images
    content = content.replace(svgPattern, (match, p1) => {
        const buffer = Buffer.from(p1);
        const fileName = `svg-image-${timestamp}-${svgCounter++}.png`;
        const svgBufferPromise = sharp(buffer).png().toBuffer();

        svgReplacements.push({
            fileName,
            uploadPromise: svgBufferPromise.then((resolvedBuffer) => {
                return uploadToS3(resolvedBuffer, fileName, "image/png");
            }),
        });

        return `<<SVG_URL:${fileName}>>`;
    });

    const imageResults = await Promise.all(
        base64Replacements.map((item) => item.uploadPromise)
    );
    const svgResults = await Promise.all(
        svgReplacements.map((item) => item.uploadPromise)
    );

    // Create a structured array
    const structuredContent = [];
    let currentTextBlock = "";

    const lines = content.split('\n');
    for (const line of lines) {
        if (line.startsWith('<<BASE64_URL:') || line.startsWith('<<SVG_URL:')) {
            if (currentTextBlock.trim() !== "") {
                structuredContent.push({ type: "text", text: currentTextBlock.trim() });
                currentTextBlock = "";
            }
            
            const fileName = line.match(/:(.*?)>>/)[1];
            const imageUrl = line.startsWith('<<BASE64_URL:') 
                ? imageResults[base64Replacements.findIndex(item => item.fileName === fileName)]
                : svgResults[svgReplacements.findIndex(item => item.fileName === fileName)];
            
            structuredContent.push({ type: "image", image_url: imageUrl });
        } else {
            currentTextBlock += line + "\n";
        }
    }

    if (currentTextBlock.trim() !== "") {
        structuredContent.push({ type: "text", text: currentTextBlock.trim() });
    }

    return structuredContent;
}

const run = async () => {
    const parsedText = convert(html, options);
    const structuredContent = await processAndReplace(parsedText);

    console.log(JSON.stringify(structuredContent, null, 2));
};

run();