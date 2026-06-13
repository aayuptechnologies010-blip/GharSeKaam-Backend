import { Router } from "express";
import { prisma } from '../../config/prismaConfig.js';
import { customerMiddleware } from "../../middlewares/customerAuth.js";


export const customerInventoryRouter = Router();

customerInventoryRouter.get('/items', (req, res, next) => {
    if (req.headers.authorization) {
        return customerMiddleware(req, res, next);
    }
    next();
}, async (req, res) => {
    try {

        let customer = null;
        if (req.customerid) {
            customer = await prisma.customer.findUnique({
                where: { id: req.customerid },
                select: { type: true }
            });
        }

        const items = await prisma.item.findMany({
            where: { currentQty: { gt: 0 } },
            select: {
                id: true,
                title: true,
                availability: true,
                categoryId: true,
                category: {
                    select: {
                        title: true,
                    }
                },
                unit: true,
                description: true,
                currentQty: true,
                retailprice: true,
                wholesaleprice: true,
                images: true,
                variants: true
            }
        });
        res.status(200).json({ success: true, items });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Something went wrong" });
    }
});

customerInventoryRouter.get('/shop-images', async (req, res) => {
    try {
        const shopImages = await prisma.shopkeeperImage.findMany({
            select: {
                id: true,
                imageurl: true,
                description: true,
                uploadedAt: true
            }
        });
        res.status(200).json({ success: true, shopImages });
    } catch (err) {

        console.error(err); 
        res.status(500).json({ success: false, message: "Something went wrong" });
    }
});


customerInventoryRouter.get('/item/:id', (req, res, next) => {
    if (req.headers.authorization) {
        return customerMiddleware(req, res, next);
    }
    next();
}, async (req, res) => {
    const { id } = req.params;
    try {

        let customer = null;
        if (req.customerid) {
            customer = await prisma.customer.findUnique({
                where: { id: req.customerid },
                select: { type: true }
            });
        }

        const item = await prisma.item.findFirst({
            where: { id, currentQty: { gt: 0 } },
            select: {
                id: true,
                title: true,
                images: true,
                availability: true,
                retailprice: true,
                wholesaleprice: true,
                unit: true,
                description: true,
                warranty: true,
                addons: true,
                discount: true,
                variants: true,
                shopkeeper: {
                    select: {
                        shopname: true,
                        shopaddress: {
                            select: {
                                city: true,
                                state: true,
                                pincode: true,
                                flatnumber: true
                            }
                        }
                    }
                },
                category: {
                    select: {
                        id: true,
                        title: true,
                        image: true
                    }
                }
            }
        });
        if (!item) return res.status(404).json({ success: false, message: "Item not found" });
        res.status(200).json({ success: true, item });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Something went wrong" });
    }
});



customerInventoryRouter.get('/categories', (req, res, next) => {
    if (req.headers.authorization) {
        return customerMiddleware(req, res, next);
    }
    next();
}, async (req, res) => {
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

customerInventoryRouter.get('/category/:categoryId/items', (req, res, next) => {
    if (req.headers.authorization) {
        return customerMiddleware(req, res, next);
    }
    next();
}, async (req, res) => {
    const { categoryId } = req.params;
    try {

        let customer = null;
        if (req.customerid) {
            customer = await prisma.customer.findUnique({
                where: { id: req.customerid },
                select: { type: true }
            });
        }

        const items = await prisma.item.findMany({
            where: { categoryId },
            select: {
                id: true,
                title: true,
                images: true,
                availability: true,
                retailprice: true,
                wholesaleprice: true,
                unit: true,
                description: true,
                currentQty: true,
                warranty: true,
                addons: true,
                discount: true,
                variants: true,
                createdAt: true
            }
        });
        res.status(200).json({ success: true, items });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Something went wrong" });
    }
});