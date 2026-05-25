import { Router } from "express";
import { prisma } from '../../config/prismaConfig.js';
import { shopkeeperMiddleware } from "../../middlewares/shopkeeperAuth.js";

export const customersRouter = Router();

/**
 * GET /api/v1/owner/customers
 * Returns a list of all unique customers who have ordered from this shopkeeper,
 * including their profile details, addresses, order count, total spent, and recent order history.
 */
customersRouter.get('/', shopkeeperMiddleware, async (req, res) => {
  try {
    const shopkeeperId = req.shopkeeperid;

    // Fetch all orders for this shopkeeper, including customer details
    const orders = await prisma.order.findMany({
      where: { shopkeeperId },
      orderBy: { createdAt: 'desc' },
      include: {
        customer: {
          include: {
            user: {
              select: {
                name: true,
                email: true,
                phone: true,
                profileimage: true
              }
            },
            houseaddress: true
          }
        }
      }
    });

    // Map unique customers and aggregate their stats
    const customersMap = new Map();

    orders.forEach(order => {
      if (!order.customer) return;
      const cust = order.customer;
      
      if (!customersMap.has(cust.id)) {
        customersMap.set(cust.id, {
          id: cust.id,
          type: cust.type,
          shopname: cust.Shopname || '',
          shopnumber: cust.Shopnumber || '',
          gstnumber: cust.GSTnumber || '',
          adhaarnumber: cust.Adhaarnumber || '',
          createdAt: cust.createdAt,
          user: {
            name: cust.user?.name || 'Customer',
            email: cust.user?.email || '',
            phone: cust.user?.phone || '',
            profileimage: cust.user?.profileimage || ''
          },
          addresses: cust.houseaddress || [],
          orders: [],
          totalOrdersCount: 0,
          totalSpent: 0,
          lastOrderDate: order.createdAt
        });
      }

      const clientData = customersMap.get(cust.id);
      clientData.orders.push({
        id: order.id,
        totalPrice: parseFloat(order.totalPrice || 0),
        status: order.status,
        createdAt: order.createdAt
      });
      clientData.totalOrdersCount++;
      clientData.totalSpent += parseFloat(order.totalPrice || 0);
    });

    const customersList = Array.from(customersMap.values());

    res.json({ success: true, customers: customersList });
  } catch (err) {
    console.error("Failed to fetch customers list:", err);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
});
