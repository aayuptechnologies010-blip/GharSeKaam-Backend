import { Router } from "express";
import { prisma } from '../../config/prismaConfig.js';
import { shopkeeperMiddleware } from "../../middlewares/shopkeeperAuth.js";

export const dashboardRouter = Router();

/**
 * GET /api/v1/shopkeeper/dashboard
 * Returns: totalItems, totalCategories, totalOrders, pendingOrders, recentOrders, lowStockItems
 */
dashboardRouter.get('/', shopkeeperMiddleware, async (req, res) => {
  try {
    const shopkeeperId = req.shopkeeperid;

    // Parallel queries for counts
    const [
      totalItems,
      totalCategories,
      totalOrders,
      pendingOrders,
      recentOrders,
      lowStockItems
    ] = await Promise.all([
      prisma.item.count({ where: { shopkeeperId } }),
      prisma.category.count({ where: { shopkeeperId } }),
      prisma.order.count({ where: { shopkeeperId } }),
      prisma.order.count({ where: { shopkeeperId, status: "PROCESSING" } }),
      prisma.order.findMany({
        where: { shopkeeperId },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          id: true,
          totalPrice: true,
          status: true,
          createdAt: true,
          customer: { select: { user: { select: { name: true, email: true } } } },
          deliveryAddress: { select: { city: true, state: true, pincode: true, flatnumber: true } }
        }
      }),
      prisma.item.findMany({
        where: { shopkeeperId, currentQty: { lt: 10 } }, // threshold: 10
        select: {
          id: true,
          title: true,
          currentQty: true,
          images: true
        },
        orderBy: { currentQty: "asc" },
        take: 10
      })
    ]);

    res.json({
      success: true,
      data: {
        totalItems,
        totalCategories,
        totalOrders,
        pendingOrders,
        recentOrders,
        lowStockItems
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
});