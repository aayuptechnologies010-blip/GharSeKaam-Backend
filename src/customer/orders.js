import { Router } from "express";
import { prisma } from '../../config/prismaConfig.js' // adjust path if different
import { customerMiddleware } from "../../middlewares/customerAuth.js";

export const customerOrdersRouter = Router();

customerOrdersRouter.post('/', customerMiddleware, async (req, res) => {
    console.log(`Customer ${req.customerid} is placing an order with data:`, req.body);
    const { items, paymentType, addressId } = req.body;
    if (!addressId) return res.status(400).json({ success: false, message: "addressId required" });
    if (!Array.isArray(items) || items.length === 0)
        return res.status(400).json({ success: false, message: "items required" });
    if (!paymentType || !["COD", "CASH"].includes(paymentType))
        return res.status(400).json({ success: false, message: "invalid paymentType" });

    try {
        const customer = await prisma.customer.findUnique({
            where: { id: req.customerid },
            select: { id: true, type: true }
        });
        if (!customer) return res.status(404).json({ success: false, message: "Customer not found" });

        // Validate address belongs to this customer
        const deliveryAddress = await prisma.address.findFirst({
            where: { id: addressId, customerid: customer.id }
        });
        if (!deliveryAddress) {
            return res.status(400).json({ success: false, message: "Invalid addressId" });
        }

        const itemIds = [...new Set(items.map(i => i.itemId))];
        const dbItems = await prisma.item.findMany({
            where: { id: { in: itemIds } },
            select: {
                id: true,
                shopkeeperId: true,
                minimumpurchase: true,
                wholesaleprice: true,
                retailprice: true,
                currentQty: true
            }
        });
        if (dbItems.length !== itemIds.length)
            return res.status(400).json({ success: false, message: "Some items not found" });

        // Check stock availability
        const itemQtyMap = {};
        for (const reqItem of items) {
            itemQtyMap[reqItem.itemId] = (itemQtyMap[reqItem.itemId] || 0) + reqItem.quantity;
        }
        for (const dbItem of dbItems) {
            if (dbItem.currentQty < itemQtyMap[dbItem.id]) {
                return res.status(400).json({ success: false, message: `Insufficient stock for item ${dbItem.id}` });
            }
        }

        const shopkeeperSet = new Set(dbItems.map(i => i.shopkeeperId));
        if (shopkeeperSet.size !== 1)
            return res.status(400).json({ success: false, message: "All items must belong to same shopkeeper" });
        const shopkeeperId = dbItems[0].shopkeeperId;

        let total = 0;
        const orderItemsData = [];
        for (const reqItem of items) {
            const dbItem = dbItems.find(i => i.id === reqItem.itemId);
            const quantity = parseInt(reqItem.quantity, 10);
            if (!Number.isInteger(quantity) || quantity <= 0)
                return res.status(400).json({ success: false, message: `Invalid quantity for item ${dbItem?.id}` });

            let unitPrice;
            if (reqItem.variant && reqItem.variant.price != null) {
                unitPrice = Number(reqItem.variant.price);
            } else if (customer.type === "WHOLESALER") {
                const threshold = dbItem.minimumpurchase || 0;
                if (quantity >= threshold && dbItem.wholesaleprice != null) {
                    unitPrice = Number(dbItem.wholesaleprice);
                } else {
                    unitPrice = Number(dbItem.retailprice);
                }
            } else {
                unitPrice = Number(dbItem.retailprice);
            }
            if (unitPrice == null || isNaN(unitPrice))
                return res.status(400).json({ success: false, message: `Price missing for item ${dbItem.id}` });

            const lineTotal = unitPrice * quantity;
            total += lineTotal;
            orderItemsData.push({
                itemId: dbItem.id,
                quantity,
                unitPrice,
                lineTotal,
                variants: reqItem.variant || null
            });
        }

        // Calculate default estimated delivery based on hour of order
        const currentHour = new Date().getHours();
        let estimatedDelivery = "Within 2 Hours";
        if (currentHour >= 18 || currentHour < 8) { // 6 PM to 8 AM
            estimatedDelivery = "Tomorrow before 11:00 AM";
        }

        const created = await prisma.order.create({
            data: {
                customerId: customer.id,
                shopkeeperId,
                paymentType,
                totalPrice: total,
                deliveryAddressId: addressId,
                estimatedDelivery,
                orderItems: { create: orderItemsData }
            },
            include: {
                orderItems: { include: { item: { select: { title: true, unit: true } } } },
                deliveryAddress: { select: { city: true, state: true, pincode: true, flatnumber: true, latitude: true, longitude: true } }
            }
        });

        return res.json({ success: true, order: created });
    } catch (err) {
        console.log(err);
        return res.status(500).json({ success: false, message: "Internal Server Error" });
    }
});

/**
 * Get all orders of customer
 */
customerOrdersRouter.get('/', customerMiddleware, async (req, res) => {
    try {
        const orders = await prisma.order.findMany({
            where: { customerId: req.customerid },
            orderBy: { createdAt: 'desc' },
            include: {
                orderItems: {
                    include: {
                        item: { select: { title: true, images: true } }
                    }
                },
                shopkeeper: { select: { shopname: true } },
                deliveryAddress: { select: { city: true, state: true, pincode: true, flatnumber: true, latitude: true, longitude: true } }
            }
        });

        // Trim to only needed fields
        const shaped = orders.map(o => ({
            id: o.id,
            paymentType: o.paymentType,
            totalPrice: o.totalPrice,
            status: o.status,
            createdAt: o.createdAt,
            estimatedDelivery: o.estimatedDelivery,
            orderItems: o.orderItems.map(oi => ({
                id: oi.id,
                quantity: oi.quantity,
                unitPrice: oi.unitPrice,
                lineTotal: oi.lineTotal,
                variants: oi.variants,
                item: oi.item
            })),
            shopkeeper: o.shopkeeper,
            deliveryAddress: o.deliveryAddress
        }));

        res.json({ success: true, orders: shaped });
    } catch (err) {
        console.log(err);
        res.status(500).json({ success: false, message: "Internal Server Error" });
    }
});

/**
 * Get single order
 */
customerOrdersRouter.get('/:id', customerMiddleware, async (req, res) => {
    try {
        const order = await prisma.order.findFirst({
            where: { id: req.params.id, customerId: req.customerid },
            include: {
                orderItems: { include: { item: { select: { title: true, images: true, unit: true } } } },
                shopkeeper: { select: { shopname: true } },
                deliveryAddress: { select: { city: true, state: true, pincode: true, flatnumber: true, latitude: true, longitude: true } }
            }
        });
        if (!order) return res.status(404).json({ success: false, message: "Not found" });
        res.json({ success: true, order });
    } catch (err) {
        console.log(err);
        res.status(500).json({ success: false, message: "Internal Server Error" });
    }
});

/**
 * Cancel an order
 */
customerOrdersRouter.put('/:id/cancel', customerMiddleware, async (req, res) => {
    console.log(`Customer ${req.customerid} requested cancellation for order ${req.params.id}`);
    console.log(`Request body:`, req.body);
    try {
        const order = await prisma.order.findFirst({
            where: { id: req.params.id, customerId: req.customerid }
        });
        if (!order) return res.status(404).json({ success: false, message: "Order not found" });

        // Assuming orders can only be cancelled if status is not DELIVERED
        if (order.status === 'DELIVERED') {
            return res.status(400).json({ success: false, message: "Order cannot be cancelled at this stage" });
        }

        await prisma.order.update({
            where: { id: req.params.id },
            data: { status: 'CANCELLED' }
        });

        res.json({ success: true, message: "Order cancelled successfully" });
    } catch (err) {
        console.log(err);
        res.status(500).json({ success: false, message: "Internal Server Error" });
    }
});