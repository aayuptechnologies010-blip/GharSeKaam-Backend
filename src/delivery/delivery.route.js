import { Router } from "express";
import { prisma } from "../../config/prismaConfig.js";
import { userMiddleware } from "../../middlewares/userAuth.js";
import { deliveryMiddleware } from "../../middlewares/deliveryAuth.js";
import { sendToShopkeeper, sendToCustomer } from "../../socket.js";
import jwt from "jsonwebtoken";

export const deliveryRouter = Router();

// 1. Signup current user as a delivery guy
deliveryRouter.post("/auth/signup", userMiddleware, async (req, res) => {
  try {
    const { address } = req.body;
    const userid = req.userid; // from userMiddleware

    // Check if user already has a delivery guy profile
    let deliveryGuy = await prisma.deliveryGuy.findUnique({
      where: { userid }
    });

    if (deliveryGuy) {
      const token = jwt.sign(
        { deliveryguyid: deliveryGuy.id, userid },
        process.env.JWT_SECRET,
        { expiresIn: "30d" }
      );
      return res.status(200).json({
        success: true,
        message: "Already registered as a delivery boy",
        token,
        profile: deliveryGuy
      });
    }

    // Create delivery guy profile
    deliveryGuy = await prisma.deliveryGuy.create({
      data: {
        userid,
        address,
        status: "AVAILABLE"
      }
    });

    const token = jwt.sign(
      { deliveryguyid: deliveryGuy.id, userid },
      process.env.JWT_SECRET,
      { expiresIn: "30d" }
    );

    res.status(201).json({
      success: true,
      message: "Delivery boy registration successful!",
      token,
      profile: deliveryGuy
    });
  } catch (err) {
    console.error("Delivery boy signup error:", err);
    res.status(500).json({ success: false, message: "Registration failed" });
  }
});

// 2. Get active profile details
deliveryRouter.get("/auth/profile", deliveryMiddleware, async (req, res) => {
  try {
    const deliveryGuy = await prisma.deliveryGuy.findUnique({
      where: { id: req.deliveryguyid },
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

    if (!deliveryGuy) {
      return res.status(404).json({ success: false, message: "Profile not found" });
    }

    res.status(200).json({ success: true, profile: deliveryGuy });
  } catch (err) {
    console.error("Profile fetch error:", err);
    res.status(500).json({ success: false, message: "Profile fetch failed" });
  }
});

// 3. Update profile status / address
deliveryRouter.patch("/auth/profile", deliveryMiddleware, async (req, res) => {
  try {
    const { address, status } = req.body;

    if (status && !["AVAILABLE", "BUSY", "INACTIVE"].includes(status.toUpperCase())) {
      return res.status(400).json({
        success: false,
        message: "Invalid status. Supported: AVAILABLE, BUSY, INACTIVE"
      });
    }

    const updated = await prisma.deliveryGuy.update({
      where: { id: req.deliveryguyid },
      data: {
        ...(address !== undefined && { address }),
        ...(status && { status: status.toUpperCase() })
      }
    });

    res.status(200).json({ success: true, profile: updated });
  } catch (err) {
    console.error("Profile update error:", err);
    res.status(500).json({ success: false, message: "Profile update failed" });
  }
});

// 4. Get available orders (ACCEPTED by shopkeeper, but not assigned to any delivery guy)
deliveryRouter.get("/orders/available", deliveryMiddleware, async (req, res) => {
  try {
    const orders = await prisma.order.findMany({
      where: {
        status: "ACCEPTED",
        deliveryGuyId: null
      },
      include: {
        customer: {
          include: {
            user: {
              select: {
                name: true,
                phone: true
              }
            }
          }
        },
        deliveryAddress: true,
        orderItems: {
          include: {
            item: {
              select: {
                title: true,
                unit: true
              }
            }
          }
        }
      },
      orderBy: { createdAt: "desc" }
    });

    res.status(200).json({ success: true, orders });
  } catch (err) {
    console.error("Fetch available orders error:", err);
    res.status(500).json({ success: false, message: "Failed to fetch available orders" });
  }
});

// 5. Get current rider's assigned/delivered orders
deliveryRouter.get("/orders/my-deliveries", deliveryMiddleware, async (req, res) => {
  try {
    const orders = await prisma.order.findMany({
      where: {
        deliveryGuyId: req.deliveryguyid
      },
      include: {
        customer: {
          include: {
            user: {
              select: {
                name: true,
                phone: true
              }
            }
          }
        },
        deliveryAddress: true,
        orderItems: {
          include: {
            item: {
              select: {
                title: true,
                unit: true
              }
            }
          }
        }
      },
      orderBy: { updatedAt: "desc" }
    });

    res.status(200).json({ success: true, orders });
  } catch (err) {
    console.error("Fetch my deliveries error:", err);
    res.status(500).json({ success: false, message: "Failed to fetch deliveries" });
  }
});

// 6. Accept / Pick up an order for delivery
deliveryRouter.patch("/orders/:id/pickup", deliveryMiddleware, async (req, res) => {
  const { id } = req.params;
  try {
    const order = await prisma.order.findUnique({
      where: { id }
    });

    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    if (order.status !== "ACCEPTED") {
      return res.status(400).json({
        success: false,
        message: `Cannot pick up order in '${order.status}' status. Must be ACCEPTED.`
      });
    }

    if (order.deliveryGuyId && order.deliveryGuyId !== req.deliveryguyid) {
      return res.status(400).json({
        success: false,
        message: "Order is already assigned to another delivery boy"
      });
    }

    // Transaction: assign delivery boy and change order status to DELIVERY_PICKUP
    const updatedOrder = await prisma.$transaction(async (tx) => {
      // Update delivery guy's status to BUSY
      await tx.deliveryGuy.update({
        where: { id: req.deliveryguyid },
        data: { status: "BUSY" }
      });

      return tx.order.update({
        where: { id },
        data: {
          status: "DELIVERY_PICKUP",
          deliveryGuyId: req.deliveryguyid
        },
        include: {
          deliveryAddress: true
        }
      });
    });

    res.status(200).json({
      success: true,
      message: "Order successfully picked up. Out for delivery!",
      order: updatedOrder
    });

    // Broadcast WebSocket updates
    try {
      sendToShopkeeper(updatedOrder.shopkeeperId, 'ORDER_STATUS_UPDATE', updatedOrder);
      sendToCustomer(updatedOrder.customerId, 'ORDER_STATUS_UPDATE', updatedOrder);
    } catch (wsErr) {
      console.error("WS Broadcast failed in pickup route:", wsErr.message);
    }
  } catch (err) {
    console.error("Pickup order error:", err);
    res.status(500).json({ success: false, message: "Failed to pick up order" });
  }
});

// 7. Mark order as DELIVERED
deliveryRouter.patch("/orders/:id/deliver", deliveryMiddleware, async (req, res) => {
  const { id } = req.params;
  try {
    const order = await prisma.order.findUnique({
      where: { id }
    });

    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    if (order.deliveryGuyId !== req.deliveryguyid) {
      return res.status(403).json({
        success: false,
        message: "Not authorized. This order is not assigned to you."
      });
    }

    if (order.status !== "DELIVERY_PICKUP") {
      return res.status(400).json({
        success: false,
        message: "Order must be in 'DELIVERY_PICKUP' status to mark it as delivered."
      });
    }

    // Transaction: mark order DELIVERED and set delivery guy status to AVAILABLE
    const updatedOrder = await prisma.$transaction(async (tx) => {
      await tx.deliveryGuy.update({
        where: { id: req.deliveryguyid },
        data: { status: "AVAILABLE" }
      });

      return tx.order.update({
        where: { id },
        data: {
          status: "DELIVERED"
        }
      });
    });

    res.status(200).json({
      success: true,
      message: "Order marked as successfully delivered!",
      order: updatedOrder
    });

    // Broadcast WebSocket updates
    try {
      sendToShopkeeper(updatedOrder.shopkeeperId, 'ORDER_STATUS_UPDATE', updatedOrder);
      sendToCustomer(updatedOrder.customerId, 'ORDER_STATUS_UPDATE', updatedOrder);
    } catch (wsErr) {
      console.error("WS Broadcast failed in deliver route:", wsErr.message);
    }
  } catch (err) {
    console.error("Deliver order error:", err);
    res.status(500).json({ success: false, message: "Failed to deliver order" });
  }
});
