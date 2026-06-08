import { Router } from "express";
import { prisma } from '../../config/prismaConfig.js';
import { shopkeeperMiddleware } from "../../middlewares/shopkeeperAuth.js";

export const shopkeeperLabourRouter = Router();

// Get all labour categories with live daily rates for shopkeepers
shopkeeperLabourRouter.get("/categories", shopkeeperMiddleware, async (req, res) => {
  try {
    const categories = await prisma.labourService.findMany({
      orderBy: { rate: "asc" }
    });
    res.status(200).json({ success: true, categories });
  } catch (err) {
    console.error("Error fetching categories:", err);
    res.status(500).json({ success: false, message: "Something went wrong" });
  }
});

// 1. Get all customer bookings (for admin log)
shopkeeperLabourRouter.get("/bookings", shopkeeperMiddleware, async (req, res) => {
  try {
    const bookings = await prisma.labourBooking.findMany({
      include: {
        labourService: true
      },
      orderBy: {
        createdAt: "desc"
      }
    });
    res.status(200).json({ success: true, bookings });
  } catch (err) {
    console.error("Error fetching bookings:", err);
    res.status(500).json({ success: false, message: "Something went wrong" });
  }
});

// 2. Accept, Complete, or Cancel a customer booking
shopkeeperLabourRouter.patch("/booking/:id", shopkeeperMiddleware, async (req, res) => {
  const { id } = req.params;
  const { status } = req.body; // PENDING, ACCEPTED, COMPLETED, CANCELLED

  if (!status || !["PENDING", "ACCEPTED", "COMPLETED", "CANCELLED"].includes(status.toUpperCase())) {
    return res.status(400).json({
      success: false,
      message: "Please provide a valid status: PENDING, ACCEPTED, COMPLETED, CANCELLED"
    });
  }

  try {
    const booking = await prisma.labourBooking.update({
      where: { id },
      data: { status: status.toUpperCase() },
      include: {
        labourService: true
      }
    });

    res.status(200).json({
      success: true,
      message: `Booking status updated to ${status}`,
      booking
    });
  } catch (err) {
    console.error("Error updating booking status:", err);
    res.status(500).json({ success: false, message: "Something went wrong" });
  }
});

// 3. Update the daily rate for a category
shopkeeperLabourRouter.patch("/rate/:categoryId", shopkeeperMiddleware, async (req, res) => {
  const { categoryId } = req.params;
  const { rate } = req.body;

  if (rate === undefined || isNaN(parseInt(rate))) {
    return res.status(400).json({ success: false, message: "Please provide a valid rate number" });
  }

  try {
    const service = await prisma.labourService.update({
      where: { categoryId },
      data: { rate: parseInt(rate) }
    });

    res.status(200).json({
      success: true,
      message: `Rate for category '${categoryId}' updated to ₹${rate}/day`,
      service
    });
  } catch (err) {
    console.error("Error updating rate:", err);
    res.status(500).json({ success: false, message: "Something went wrong. Verify categoryId exists." });
  }
});

// 4. Reset all rates to default factory values (Safe update operation to preserve booking histories)
shopkeeperLabourRouter.post("/reset-rates", shopkeeperMiddleware, async (req, res) => {
  const defaults = {
    mason: 950,
    electrician: 1100,
    plumber: 900,
    painter: 800,
    carpenter: 1000,
    helper: 600,
  };

  try {
    for (const [catId, defaultRate] of Object.entries(defaults)) {
      await prisma.labourService.updateMany({
        where: { categoryId: catId },
        data: { rate: defaultRate }
      });
    }

    const updated = await prisma.labourService.findMany({
      orderBy: { rate: "asc" }
    });

    res.status(200).json({
      success: true,
      message: "All daily rates successfully restored to default settings.",
      categories: updated
    });
  } catch (err) {
    console.error("Error resetting rates:", err);
    res.status(500).json({ success: false, message: "Something went wrong" });
  }
});
