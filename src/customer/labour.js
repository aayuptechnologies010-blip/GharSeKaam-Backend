import { Router } from "express";
import { prisma } from '../../config/prismaConfig.js';

export const customerLabourRouter = Router();

// Default Labour Categories aligned with the user website
const defaultLabourCategories = [
  {
    categoryId: "mason",
    title: "Mason / राजमिस्त्री",
    subtitle: "Brickwork, Plastering & Flooring",
    rate: 950,
    unit: "per day",
    badge: "Most Booked",
    skills: ["Brick laying", "Plastering", "Tile fixing", "Flooring"],
    rating: 4.8,
    reviews: 1240,
  },
  {
    categoryId: "electrician",
    title: "Electrician / इलेक्ट्रिशियन",
    subtitle: "Wiring, Fittings & Panel Work",
    rate: 1100,
    unit: "per day",
    badge: "Certified",
    skills: ["House wiring", "Panel installation", "Fitting & fixtures", "Earthing"],
    rating: 4.9,
    reviews: 870,
  },
  {
    categoryId: "plumber",
    title: "Plumber / प्लम्बर",
    subtitle: "Pipes, Sanitation & Fittings",
    rate: 900,
    unit: "per day",
    badge: "Verified",
    skills: ["Pipe fitting", "Sanitary work", "Water tanks", "Drainage"],
    rating: 4.7,
    reviews: 680,
  },
  {
    categoryId: "painter",
    title: "Painter / पेंटर",
    subtitle: "Interior, Exterior & Texture",
    rate: 800,
    unit: "per day",
    badge: "Expert",
    skills: ["Wall painting", "Texture paint", "Polish", "Waterproofing"],
    rating: 4.6,
    reviews: 520,
  },
  {
    categoryId: "carpenter",
    title: "Carpenter / बढ़ई",
    subtitle: "Doors, Furniture & Shuttering",
    rate: 1000,
    unit: "per day",
    badge: "Skilled",
    skills: ["Door/window fitting", "Furniture work", "Shuttering", "Wood polish"],
    rating: 4.7,
    reviews: 390,
  },
  {
    categoryId: "helper",
    title: "General Helper / सामान्य मजदूर",
    subtitle: "Loading, Cleaning & Support",
    rate: 600,
    unit: "per day",
    badge: "Affordable",
    skills: ["Material loading", "Site cleaning", "Sand mixing", "General support"],
    rating: 4.5,
    reviews: 1850,
  },
];

// Helper to seed categories if they don't exist
async function ensureCategoriesSeeded() {
  const count = await prisma.labourService.count();
  if (count === 0) {
    console.log("Seeding default labour categories into database...");
    for (const cat of defaultLabourCategories) {
      await prisma.labourService.create({
        data: cat,
      });
    }
  }
}

// 1. Get all labour categories with live daily rates
customerLabourRouter.get("/categories", async (req, res) => {
  try {
    await ensureCategoriesSeeded();
    const categories = await prisma.labourService.findMany({
      orderBy: { rate: "asc" }
    });
    res.status(200).json({ success: true, categories });
  } catch (err) {
    console.error("Error fetching labour categories:", err);
    res.status(500).json({ success: false, message: "Something went wrong" });
  }
});

// 2. Get bookings by phone number (customer ke apne bookings)
customerLabourRouter.get("/mybookings", async (req, res) => {
  const phone = req.query.phone;
  if (!phone) {
    return res.status(400).json({ success: false, message: "phone query param required" });
  }
  try {
    const bookings = await prisma.labourBooking.findMany({
      where: { phone },
      orderBy: { createdAt: "desc" },
      include: { labourService: true }
    });
    res.status(200).json({ success: true, bookings });
  } catch (err) {
    console.error("Error fetching customer labour bookings:", err);
    res.status(500).json({ success: false, message: "Something went wrong" });
  }
});

// 3. Book a labourer service
customerLabourRouter.post("/book", async (req, res) => {
  const { name, phone, address, date, days = 1, quantity = 1, categoryId } = req.body;

  if (!name || !phone || !address || !date || !categoryId) {
    return res.status(400).json({
      success: false,
      message: "Please fill all required booking parameters: name, phone, address, date, categoryId"
    });
  }

  if (!address.toLowerCase().includes("gorakhpur")) {
    return res.status(400).json({
      success: false,
      message: "Sorry, currently we are not working in your city. We only support bookings in Gorakhpur."
    });
  }

  try {
    await ensureCategoriesSeeded();

    // Check if worker category exists
    const service = await prisma.labourService.findUnique({
      where: { categoryId }
    });

    if (!service) {
      return res.status(404).json({ success: false, message: `Labour category '${categoryId}' not found` });
    }

    // Compute cost index
    const totalCost = service.rate * parseInt(days) * parseInt(quantity);

    // Save client booking requests
    const booking = await prisma.labourBooking.create({
      data: {
        name,
        phone,
        address,
        date,
        days: parseInt(days),
        quantity: parseInt(quantity),
        totalCost,
        labourServiceId: service.id,
      },
      include: {
        labourService: true
      }
    });

    res.status(201).json({
      success: true,
      message: "Booking requested successfully!",
      booking
    });
  } catch (err) {
    console.error("Error creating labour booking:", err);
    res.status(500).json({ success: false, message: "Something went wrong" });
  }
});
