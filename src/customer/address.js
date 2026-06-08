import { Router } from "express";
import { prisma } from '../../config/prismaConfig.js';
import { customerMiddleware } from "../../middlewares/customerAuth.js";

export const addressRouter = Router();

// Add a new address for a customer by customer id
addressRouter.post('/add', customerMiddleware, async (req, res) => {
    const { city, state, pincode, flatnumber, shopname, shopnumber, gstnumber, adhaarnumber, type, latitude, longitude } = req.body;
    const customerid = req.customerid;
    try {
        if (!city || !state || state.toLowerCase() !== 'uttar pradesh' || city.toLowerCase() !== 'gorakhpur') {
            return res.status(400).json({ success: false, message: "Sorry, currently we are not working in your city. We only operate in Gorakhpur." });
        }
        const customer = await prisma.customer.findUnique({ where: { id: customerid } });
        if (!customer) {
            return res.status(404).json({ success: false, message: "Customer not found" });
        }
        // Prepare optional customer update data only for provided fields
        const updateData = {};
        if (shopname) updateData.Shopname = shopname;
        if (shopnumber) updateData.Shopnumber = shopnumber;
        if (gstnumber) updateData.GSTnumber = gstnumber;
        if (adhaarnumber) updateData.Adhaarnumber = adhaarnumber;
        if (type) updateData.type = type;

        const addressCreate = prisma.address.create({
            data: {
                city,
                state,
                pincode,
                flatnumber,
                // include lat/lng when provided
                ...(latitude !== undefined && latitude !== null ? { latitude: parseFloat(latitude) } : {}),
                ...(longitude !== undefined && longitude !== null ? { longitude: parseFloat(longitude) } : {}),
                customer: { connect: { id: customerid } }
            }
        });

        // If there are optional fields, update the customer and create address in a transaction
        if (Object.keys(updateData).length) {
            const [updatedCustomer, newAddress] = await prisma.$transaction([
                prisma.customer.update({ where: { id: customerid }, data: updateData }),
                addressCreate
            ]);
            return res.status(201).json({ success: true, address: newAddress, customer: updatedCustomer });
        }

        // Otherwise just create the address
        const newAddress = await addressCreate;
        res.status(201).json({ success: true, address: newAddress });
    } catch (err) {
        console.error(err);
        // Handle Prisma unique constraint error (e.g., Shopname/GST/Adhaar unique)
        if (err && err.code === 'P2002') {
            return res.status(400).json({ success: false, message: 'Unique constraint failed', details: err.meta });
        }
        res.status(500).json({ success: false, message: "Something went wrong" });
    }
});

// Get all addresses for a customer by customer id
addressRouter.get('/all', customerMiddleware, async (req, res) => {
    const customerid = req.customerid;
    try {
        const customer = await prisma.customer.findUnique({
            where: { id: customerid },
            include: { houseaddress: true }
        });
        if (!customer) {
            return res.status(404).json({ success: false, message: "Customer not found" });
        }
        res.status(200).json({ success: true, addresses: customer.houseaddress });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Something went wrong" });
    }
});

// Update (or create if not exist) phone number and name for user
addressRouter.put('/update-details', customerMiddleware, async (req, res) => {
    const { phone, name } = req.body;
    const customerid = req.customerid;
    try {
        const customer = await prisma.customer.findUnique({ where: { id: customerid }, include: { user: true } });
        if (!customer) {
            return res.status(404).json({ success: false, message: "Customer not found" });
        }
        const user = await prisma.user.update({
            where: { googleid: customer.user.googleid },
            data: { phone, name }
        });
        res.status(200).json({ success: true, user });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Something went wrong" });
    }
});
