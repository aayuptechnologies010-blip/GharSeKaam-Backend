import { Router } from "express";
import { prisma } from '../../config/prismaConfig.js' // adjust path
import { shopkeeperMiddleware } from "../../middlewares/shopkeeperAuth.js";
import { sendToCustomer, broadcastToRiders } from "../../socket.js";

export const shopkeeperOrdersRouter = Router();

/**
 * List all orders for shopkeeper
 */
shopkeeperOrdersRouter.get('/', shopkeeperMiddleware, async (req, res) => {
  try {
    const orders = await prisma.order.findMany({
      where: { shopkeeperId: req.shopkeeperid },
      orderBy: { createdAt: 'desc' },
      include: {
        customer: { select: { id: true } },
        orderItems: { include: { item: { select: { title: true, unit: true,  variants: true } } } },
        deliveryAddress: { select: { city: true, state: true, pincode: true, flatnumber: true, latitude: true, longitude: true } }
      }
    });
    res.json({ success: true, orders });
  } catch (err) {
    console.log(err);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
});

async function transitionOrder(req, res, targetStatus) {
  const { id } = req.params;
  try {
    const order = await prisma.order.findFirst({
      where: { id, shopkeeperId: req.shopkeeperid },
      include: { orderItems: true, deliveryAddress: true }
    });
    if (!order) return res.status(404).json({ success: false, message: "Order not found" });

    if (targetStatus === 'ACCEPTED' && order.status !== 'PROCESSING')
      return res.status(400).json({ success: false, message: "Only PROCESSING can be accepted" });
    if (['REJECTED'].includes(targetStatus) && order.status !== 'PROCESSING')
      return res.status(400).json({ success: false, message: "Only PROCESSING can be rejected" });
    if (targetStatus === 'CANCELLED' && !['ACCEPTED', 'DELIVERY_PICKUP'].includes(order.status))
      return res.status(400).json({ success: false, message: "Can cancel only after ACCEPTED / DELIVERY_PICKUP" });
    if (targetStatus === 'DELIVERY_PICKUP' && order.status !== 'ACCEPTED')
      return res.status(400).json({ success: false, message: "Move to DELIVERY_PICKUP only from ACCEPTED" });
    if (targetStatus === 'DELIVERED' && !['ACCEPTED', 'DELIVERY_PICKUP'].includes(order.status))
      return res.status(400).json({ success: false, message: "Deliver only after ACCEPTED / DELIVERY_PICKUP" });

    const result = await prisma.$transaction(async (tx) => {
      if (targetStatus === 'ACCEPTED') {
        for (const oi of order.orderItems) {
          const item = await tx.item.findUnique({ where: { id: oi.itemId }, select: { currentQty: true } });
          if (!item || item.currentQty < oi.quantity) {
            throw new Error(`Insufficient stock for item ${oi.itemId}`);
          }
          await tx.item.update({
            where: { id: oi.itemId },
            data: { currentQty: { decrement: oi.quantity } }
          });
        }
      } else if (targetStatus === 'CANCELLED') {
        if (['ACCEPTED', 'DELIVERY_PICKUP'].includes(order.status)) {
          for (const oi of order.orderItems) {
            await tx.item.update({
              where: { id: oi.itemId },
              data: { currentQty: { increment: oi.quantity } }
            });
          }
        }
      }
      return tx.order.update({
        where: { id: order.id },
        data: { status: targetStatus }
      });
    });

    res.json({ success: true, order: result });

    // Send real-time updates via WebSockets
    try {
      sendToCustomer(order.customerId, 'ORDER_STATUS_UPDATE', result);
      if (targetStatus === 'ACCEPTED') {
        broadcastToRiders('NEW_AVAILABLE_ORDER', result);
      }
    } catch (wsErr) {
      console.error("WS Broadcast failed in transitionOrder:", wsErr.message);
    }
  } catch (err) {
    console.log(err);
    res.status(400).json({ success: false, message: err.message || "Transition failed" });
  }
}

shopkeeperOrdersRouter.patch('/:id/accept', shopkeeperMiddleware, (req, res) =>
  transitionOrder(req, res, 'ACCEPTED'));

shopkeeperOrdersRouter.patch('/:id/reject', shopkeeperMiddleware, (req, res) =>
  transitionOrder(req, res, 'REJECTED'));

shopkeeperOrdersRouter.patch('/:id/cancel', shopkeeperMiddleware, (req, res) =>
  transitionOrder(req, res, 'CANCELLED'));

shopkeeperOrdersRouter.patch('/:id/delivery-pickup', shopkeeperMiddleware, (req, res) =>
  transitionOrder(req, res, 'DELIVERY_PICKUP'));

shopkeeperOrdersRouter.patch('/:id/delivered', shopkeeperMiddleware, (req, res) =>
  transitionOrder(req, res, 'DELIVERED'));

shopkeeperOrdersRouter.patch('/:id/update-delivery-time', shopkeeperMiddleware, async (req, res) => {
  const { id } = req.params;
  const { estimatedDelivery } = req.body;
  try {
    const order = await prisma.order.findFirst({
      where: { id, shopkeeperId: req.shopkeeperid }
    });
    if (!order) return res.status(404).json({ success: false, message: "Order not found" });

    const updated = await prisma.order.update({
      where: { id },
      data: { estimatedDelivery }
    });

    res.json({ success: true, order: updated });
  } catch (err) {
    console.log(err);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
});

/**
 * Get all registered delivery guys / riders
 */
shopkeeperOrdersRouter.get('/delivery-guys', shopkeeperMiddleware, async (req, res) => {
  try {
    const riders = await prisma.deliveryGuy.findMany({
      include: {
        user: {
          select: {
            name: true,
            email: true,
            phone: true,
            profileimage: true
          }
        }
      }
    });
    res.json({ success: true, riders });
  } catch (err) {
    console.error("Failed to fetch delivery guys list:", err);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
});

/**
 * Manually assign an order to a delivery guy / rider
 */
shopkeeperOrdersRouter.patch('/:id/assign', shopkeeperMiddleware, async (req, res) => {
  const { id } = req.params;
  const { deliveryGuyId } = req.body;
  try {
    const order = await prisma.order.findFirst({
      where: { id, shopkeeperId: req.shopkeeperid }
    });
    if (!order) return res.status(404).json({ success: false, message: "Order not found" });

    const rider = await prisma.deliveryGuy.findUnique({
      where: { id: deliveryGuyId }
    });
    if (!rider) return res.status(404).json({ success: false, message: "Rider not found" });

    const updated = await prisma.order.update({
      where: { id },
      data: {
        deliveryGuyId
      },
      include: {
        deliveryAddress: true,
        deliveryGuy: {
          include: {
            user: { select: { name: true, phone: true } }
          }
        }
      }
    });

    res.json({ success: true, order: updated });

    // Send WebSocket notification to the customer about assignment
    try {
      sendToCustomer(order.customerId, 'ORDER_STATUS_UPDATE', updated);
    } catch (wsErr) {
      console.error("WS Broadcast failed in assignOrder:", wsErr.message);
    }
  } catch (err) {
    console.error("Failed to assign order:", err);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
});