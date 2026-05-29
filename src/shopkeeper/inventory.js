import { Router } from "express";
import { prisma } from '../../config/prismaConfig.js';
import { userMiddleware } from "../../middlewares/userAuth.js";
import cloudinary from '../../config/cloudinary.js';
import multer from 'multer';
import { shopkeeperMiddleware } from "../../middlewares/shopkeeperAuth.js";

const upload = multer({ storage: multer.memoryStorage() });

export const inventoryRouter = Router();

// Helper to upload a single image buffer to cloudinary
async function uploadImageBuffer(buffer) {
    return new Promise((resolve, reject) => {
        cloudinary.uploader.upload_stream({ folder: 'buildmart' }, (err, result) => {
            if (err) return reject(err);
            resolve(result.secure_url);
        }).end(buffer);
    });
}

// Helper to upload multiple image buffers to cloudinary
async function uploadImageBuffers(files) {
    const urls = [];
    for (const file of files) {
        const url = await uploadImageBuffer(file.buffer);
        urls.push(url);
    }
    return urls;
}

// Helper to safely parse addons input into a String array
function parseAddons(addons) {
    if (!addons) return [];
    if (Array.isArray(addons)) return addons;
    if (typeof addons === 'string') {
        try {
            const parsed = JSON.parse(addons);
            if (Array.isArray(parsed)) return parsed.map(String);
        } catch (e) {
            // Ignore JSON parse error, treat as raw comma-separated string
        }
        return addons.split(',').map(item => item.trim()).filter(Boolean);
    }
    return [];
}

// Create a new category (with image file OR image URL)
inventoryRouter.post('/category', shopkeeperMiddleware, upload.single('image'), async (req, res) => {
    const { title, imageUrl } = req.body;
    const shopkeeperid = await req.shopkeeperid;
    try {
        const shopkeeper = await prisma.shopkeeper.findUnique({ where: { id: shopkeeperid } });
        if (!shopkeeper) return res.status(404).json({ success: false, message: "Shopkeeper not found" });
        
        let imageUrlFinal;
        if (req.file) {
            imageUrlFinal = await uploadImageBuffer(req.file.buffer);
        } else if (imageUrl) {
            imageUrlFinal = imageUrl;
        } else {
            return res.status(400).json({ success: false, message: "Image file or image URL is required" });
        }
        
        const category = await prisma.category.create({
            data: {
                title,
                image: imageUrlFinal,
                shopkeeperId: shopkeeper.id
            }
        });
        res.status(201).json({ success: true, category });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Something went wrong" });
    }
});

// Update category (title/image file)
inventoryRouter.put('/category/:id', shopkeeperMiddleware, upload.single('image'), async (req, res) => {
    const { title } = req.body;
    const { id } = req.params;
    try {
        let updateData = {};
        if (title) updateData.title = title;
        if (req.file) updateData.image = await uploadImageBuffer(req.file.buffer);
        const category = await prisma.category.update({
            where: { id },
            data: updateData
        });
        res.status(200).json({ success: true, category });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Something went wrong" });
    }
});

// Delete a category
inventoryRouter.delete('/category/:id', shopkeeperMiddleware, async (req, res) => {
    const { id } = req.params;
    const shopkeeperid = await req.shopkeeperid;
    try {
        const category = await prisma.category.findUnique({ where: { id } });
        if (!category) return res.status(404).json({ success: false, message: 'Category not found' });
        if (category.shopkeeperId !== shopkeeperid) return res.status(403).json({ success: false, message: 'Not authorized to delete this category' });
        
        await prisma.category.delete({ where: { id } });
        res.status(200).json({ success: true, message: 'Category deleted successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Something went wrong. Ensure this category has no active items linked.' });
    }
});

// Add item under a category (with up to 5 image files OR image URLs)
inventoryRouter.post('/item', shopkeeperMiddleware, upload.array('images', 5), async (req, res) => {
    const { title, wholesaleprice, unit, description, availability, currentQty, warranty, addons, discount, categoryId, retailprice, minimumpurchase=0, variants, imageUrls } = req.body;
    console.log(req.body);
    const shopkeeperid = await req.shopkeeperid;
    try {
        const shopkeeper = await prisma.shopkeeper.findUnique({ where: { id: shopkeeperid } });
        if (!shopkeeper) return res.status(404).json({ success: false, message: "Shopkeeper not found" });
        
        let finalImageUrls = [];
        if (req.files && req.files.length > 0) {
            finalImageUrls = await uploadImageBuffers(req.files);
        }
        // Also accept direct image URLs
        if (imageUrls) {
            const urlList = Array.isArray(imageUrls) ? imageUrls : [imageUrls];
            finalImageUrls = [...finalImageUrls, ...urlList.filter(Boolean)];
        }
        if (finalImageUrls.length < 1 || finalImageUrls.length > 5) {
            return res.status(400).json({ success: false, message: "You must provide between 1 and 5 images (files or URLs)." });
        }

        // Validate variants if provided
        let variantsData = undefined;
        if (variants) {
            try {
                variantsData = JSON.parse(variants);
                // Example validation: variants should be an array of objects with size and price
                if (!Array.isArray(variantsData)) {
                    return res.status(400).json({ success: false, message: "Variants must be an array." });
                }
                for (const v of variantsData) {
                    if (!v.size || typeof v.price !== 'number') {
                        return res.status(400).json({ success: false, message: "Each variant must have a size and price (number)." });
                    }
                }
            } catch (e) {
                return res.status(400).json({ success: false, message: "Invalid variants JSON." });
            }
        }

        const item = await prisma.item.create({
            data: {
                title,
                minimumpurchase : parseInt(minimumpurchase),
                images: finalImageUrls,
                wholesaleprice: parseFloat(wholesaleprice),
                retailprice: parseFloat(retailprice),
                unit,
                availability,
                description,
                currentQty: parseInt(currentQty),
                warranty,
                addons: parseAddons(addons),
                discount: discount ? parseFloat(discount) : null,
                shopkeeperId: shopkeeper.id,
                categoryId,
                variants: variantsData ? variantsData : undefined
            }
        });
        res.status(201).json({ success: true, item });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Something went wrong" });
    }
});

// Shopkeeper images CRUD (ShopkeeperImage model)
inventoryRouter.post('/shop-image', shopkeeperMiddleware, upload.single('image'), async (req, res) => {
    const { description } = req.body;
    const shopkeeperid = await req.shopkeeperid;
    try {
        const shopkeeper = await prisma.shopkeeper.findUnique({ where: { id: shopkeeperid } });
        if (!shopkeeper) return res.status(404).json({ success: false, message: "Shopkeeper not found" });
        if (!req.file) return res.status(400).json({ success: false, message: "Image file is required" });
        const imageurl = await uploadImageBuffer(req.file.buffer);
        const shopImage = await prisma.shopkeeperImage.create({
            data: {
                imageurl,
                description,
                shopkeeperId: shopkeeper.id
            }
        });
        res.status(201).json({ success: true, shopImage });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Something went wrong" });
    }
});

// Get all shop images public for current shopkeeper
inventoryRouter.get('/shop-images', shopkeeperMiddleware, async (req, res) => {
    const shopkeeperid = await req.shopkeeperid;
    try {
        const shopkeeper = await prisma.shopkeeper.findUnique({ where: { id: shopkeeperid } });
        if (!shopkeeper) return res.status(404).json({ success: false, message: "Shopkeeper not found" });
        const images = await prisma.shopkeeperImage.findMany({
            where: { shopkeeperId: shopkeeper.id },
            select: { id: true, imageurl: true, description: true, uploadedAt: true }
        });
        res.status(200).json({ success: true, images });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Something went wrong" });
    }
});

// Get single shop image by id
inventoryRouter.get('/shop-image/:id', shopkeeperMiddleware, async (req, res) => {
    const { id } = req.params;
    const shopkeeperid = await req.shopkeeperid;
    try {
        const image = await prisma.shopkeeperImage.findUnique({ where: { id } });
        if (!image) return res.status(404).json({ success: false, message: 'Shop image not found' });
        if (image.shopkeeperId !== shopkeeperid) return res.status(403).json({ success: false, message: 'Not authorized to view this image' });
        res.status(200).json({ success: true, image });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Something went wrong' });
    }
});

// Update shop image (description and/or replace image)
inventoryRouter.put('/shop-image/:id', shopkeeperMiddleware, upload.single('image'), async (req, res) => {
    const { id } = req.params;
    const { description } = req.body;
    const shopkeeperid = await req.shopkeeperid;
    try {
        const existing = await prisma.shopkeeperImage.findUnique({ where: { id } });
        if (!existing) return res.status(404).json({ success: false, message: 'Shop image not found' });
        if (existing.shopkeeperId !== shopkeeperid) return res.status(403).json({ success: false, message: 'Not authorized to update this image' });
        const updateData = {};
        if (description !== undefined) updateData.description = description;
        if (req.file) updateData.imageurl = await uploadImageBuffer(req.file.buffer);
        const updated = await prisma.shopkeeperImage.update({ where: { id }, data: updateData });
        res.status(200).json({ success: true, updated });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Something went wrong' });
    }
});

// Delete a shop image
inventoryRouter.delete('/shop-image/:id', shopkeeperMiddleware, async (req, res) => {
    const { id } = req.params;
    const shopkeeperid = await req.shopkeeperid;
    try {
        const existing = await prisma.shopkeeperImage.findUnique({ where: { id } });
        if (!existing) return res.status(404).json({ success: false, message: 'Shop image not found' });
        if (existing.shopkeeperId !== shopkeeperid) return res.status(403).json({ success: false, message: 'Not authorized to delete this image' });
        await prisma.shopkeeperImage.delete({ where: { id } });
        res.status(200).json({ success: true, message: 'Shop image deleted' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Something went wrong' });
    }
});

// Update item (fields and images)
inventoryRouter.put('/item/:id', shopkeeperMiddleware, upload.array('images', 5), async (req, res) => {
    const { minimumpurchase, title, wholesaleprice, retailprice, unit, description, currentQty, warranty, addons, discount, categoryId, variants } = req.body;
    const { id } = req.params;
    try {
        let updateData = {};
console.log(req.body);
        // parse and validate variants if provided
        let variantsData = undefined;
        if (variants) {
            try {
                variantsData = JSON.parse(variants);
                if (!Array.isArray(variantsData)) {
                    return res.status(400).json({ success: false, message: "Variants must be an array." });
                }
                for (const v of variantsData) {
                    if (!v.size || typeof v.price !== 'number') {
                        return res.status(400).json({ success: false, message: "Each variant must have a size and price (number)." });
                    }
                }
            } catch (e) {
                return res.status(400).json({ success: false, message: "Invalid variants JSON." });
            }
        }

        if (title) updateData.title = title;
        if (req.files && req.files.length > 0) {
            if (req.files.length < 1 || req.files.length > 5) {
                return res.status(400).json({ success: false, message: "You must provide between 1 and 5 image files." });
            }
            updateData.images = await uploadImageBuffers(req.files);
        }
        if (wholesaleprice) updateData.wholesaleprice = parseFloat(wholesaleprice);
        if (retailprice) updateData.retailprice = parseFloat(retailprice);
        if (unit) updateData.unit = unit;
        if (minimumpurchase) updateData.minimumpurchase = parseInt(minimumpurchase);
        if (description) updateData.description = description;
        if (currentQty) updateData.currentQty = parseInt(currentQty);
        if (warranty) updateData.warranty = warranty;
        if (addons) updateData.addons = parseAddons(addons);
        if (discount) updateData.discount = parseFloat(discount);
        if (categoryId) updateData.categoryId = categoryId;
        if (variantsData) updateData.variants = variantsData;

        const item = await prisma.item.update({
            where: { id },
            data: updateData
        });
        res.status(200).json({ success: true, item });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Something went wrong" });
    }
});

// Delete an item (only owner shopkeeper can delete)
inventoryRouter.delete('/item/:id', shopkeeperMiddleware, async (req, res) => {
    const { id } = req.params;
    const shopkeeperid = await req.shopkeeperid;
    try {
        const item = await prisma.item.findUnique({ where: { id } });
        if (!item) return res.status(404).json({ success: false, message: 'Item not found' });
        if (item.shopkeeperId !== shopkeeperid) return res.status(403).json({ success: false, message: 'Not authorized to delete this item' });
        await prisma.item.delete({ where: { id } });
        res.status(200).json({ success: true, message: 'Item deleted' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Something went wrong' });
    }
});

// Add quantity to item by item id
inventoryRouter.patch('/item/:id/add-quantity', shopkeeperMiddleware, async (req, res) => {
    const { quantity } = req.body;
    const { id } = req.params;
    try {
        const item = await prisma.item.update({
            where: { id },
            data: {
                currentQty: { increment: parseInt(quantity) }
            }
        });
        res.status(200).json({ success: true, item });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Something went wrong" });
    }
});

// Get all categories
inventoryRouter.get('/categories', shopkeeperMiddleware, async (req, res) => {
    try {
        const categories = await prisma.category.findMany({
            select: {
                id: true,
                title: true,
                image: true,
                createdAt: true
            }
        });
        res.status(200).json({ success: true, categories });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Something went wrong" });
    }
});

// Get all items
inventoryRouter.get('/items', shopkeeperMiddleware, async (req, res) => {
    try {
        const items = await prisma.item.findMany({
            select: {
                id: true,
                title: true,
                images: true,
                wholesaleprice: true,
                retailprice: true,
                unit: true,
                description: true,
                currentQty: true,
                warranty: true,
                addons: true,
                discount: true,
                categoryId: true,
                createdAt: true,
                variants: true
            }
        });
        res.status(200).json({ success: true, items });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Something went wrong" });
    }
});

// Get items under a specific category
inventoryRouter.get('/category/:categoryId/items', shopkeeperMiddleware, async (req, res) => {
    const { categoryId } = req.params;
    try {
        const items = await prisma.item.findMany({
            where: { categoryId },
            select: {
                id: true,
                title: true,
                images: true,
                wholesaleprice: true,
                retailprice: true,
                unit: true,
                description: true,
                currentQty: true,
                warranty: true,
                addons: true,
                discount: true,
                createdAt: true
            }
        });
        res.status(200).json({ success: true, items });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Something went wrong" });
    }
});
