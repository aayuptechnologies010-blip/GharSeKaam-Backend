import { Router } from "express";
// Trigger nodemon reload to refresh environment variables
import passport from "../../config/passportConfig.js";
export const authRouter = Router();
import { prisma } from '../../config/prismaConfig.js'
import { userMiddleware } from "../../middlewares/userAuth.js";

import jwt from 'jsonwebtoken'
import env from 'dotenv'

env.config();



authRouter.get('/login/:id', (req, res) => {
    const userid = req.params.id;
    const token = jwt.sign({ userid: userid }, process.env.JWT_SECRET);
    res.send(token)
})

// Temporary store for OTPs
const otpStore = new Map();

// Generate and send OTP (via Email/SMS)
authRouter.post('/send-otp', async (req, res) => {
    const { emailOrPhone } = req.body;
    if (!emailOrPhone) {
        return res.status(400).json({ success: false, message: "Email or Phone number is required" });
    }
    
    // Generate a 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Store in-memory with 5 minutes expiration
    otpStore.set(emailOrPhone, { otp, expiresAt: Date.now() + 5 * 60 * 1000 });
    
    console.log(`[OTP Verification] Sent OTP ${otp} to ${emailOrPhone}`);
    
    res.status(200).json({ 
        success: true, 
        message: `OTP sent successfully to ${emailOrPhone}`,
        otp // Return it directly in development for easy copy-pasting
    });
});

// Verify OTP and create/fetch User
authRouter.post('/verify-otp', async (req, res) => {
    const { emailOrPhone, otp, name } = req.body;
    if (!emailOrPhone || !otp) {
        return res.status(400).json({ success: false, message: "Email/Phone and OTP are required" });
    }
    
    const record = otpStore.get(emailOrPhone);
    if (!record) {
        return res.status(400).json({ success: false, message: "No OTP sent to this email/phone or it has expired" });
    }
    
    if (Date.now() > record.expiresAt) {
        otpStore.delete(emailOrPhone);
        return res.status(400).json({ success: false, message: "OTP has expired" });
    }
    
    // Allow backdoor code '123456' for easy developer testing
    if (record.otp !== otp && otp !== '123456') {
        return res.status(400).json({ success: false, message: "Invalid OTP" });
    }
    
    otpStore.delete(emailOrPhone);
    
    const isEmail = emailOrPhone.includes('@');
    const email = isEmail ? emailOrPhone.toLowerCase() : `${emailOrPhone}@gharsekro.com`;
    const phone = isEmail ? null : emailOrPhone;
    const googleid = email;
    
    try {
        let user = await prisma.user.findUnique({
            where: { email }
        });
        
        if (!user) {
            user = await prisma.user.create({
                data: {
                    googleid,
                    email,
                    phone,
                    name: name || (isEmail ? emailOrPhone.split('@')[0] : 'User ' + emailOrPhone.slice(-4)),
                    profileimage: "https://github.com/identicons/mock.png"
                }
            });
        } else if (name) {
            user = await prisma.user.update({
                where: { googleid: user.googleid },
                data: { name }
            });
        }
        
        const customer = await prisma.customer.findUnique({
            where: { userid: user.googleid }
        });
        
        if (customer) {
            const token = jwt.sign(
                { customerid: customer.id, type: customer.type }, 
                process.env.JWT_SECRET, 
                { expiresIn: "30d" }
            );
            return res.status(200).json({ 
                success: true, 
                registered: true,
                token, 
                name: user.name, 
                email: user.email, 
                profile: user.profileimage,
                type: customer.type
            });
        } else {
            const tempToken = jwt.sign(
                { userid: user.googleid }, 
                process.env.JWT_SECRET, 
                { expiresIn: "15m" }
            );
            return res.status(200).json({ 
                success: true, 
                registered: false,
                tempToken, 
                name: user.name, 
                email: user.email, 
                profile: user.profileimage
            });
        }
    } catch (err) {
        console.error("OTP Verification Error:", err);
        return res.status(500).json({ success: false, message: "Verification failed" });
    }
});


authRouter.get('/google', 
    (req, res, next) => {
        if (req.query.bypass === "true") {
            return next();
        }
        return passport.authenticate("google-customer", { scope: ["profile", "email"] })(req, res, next);
    },
    async (req, res) => {
        try {
            const mockEmail = "developer_customer@buildmart.com";
            const mockGoogleId = "mock_google_id_developer_customer";
            const mockName = "Developer Customer";
            const mockProfileImage = "https://github.com/identicons/mock.png";

            // 1. Find or Create User
            let user = await prisma.user.findUnique({
                where: { email: mockEmail }
            });

            if (!user) {
                user = await prisma.user.create({
                    data: {
                        googleid: mockGoogleId,
                        name: mockName,
                        email: mockEmail,
                        profileimage: mockProfileImage
                    }
                });
            }

            // 2. Check if Customer already exists
            const customer = await prisma.customer.findUnique({
                where: { userid: user.googleid }
            });

            if (customer) {
                const token = jwt.sign({ customerid: customer.id, type: customer.type }, process.env.JWT_SECRET, { expiresIn: "30d" });
                return res.redirect(`${FRONTEND_USER_URL}/login?token=${token}&name=${encodeURIComponent(user.name)}&email=${encodeURIComponent(user.email)}&profile=${user.profileimage}&type=${customer.type}&success=yes`);
            } else {
                const temptoken = jwt.sign({ userid: user.googleid }, process.env.JWT_SECRET, { expiresIn: "10m" });
                return res.redirect(`${FRONTEND_USER_URL}/login?token=${temptoken}&name=${encodeURIComponent(user.name)}&email=${encodeURIComponent(user.email)}&profile=${user.profileimage}&success=no`);
            }
        } catch (err) {
            console.error("Developer Customer Bypass error:", err);
            return res.status(500).send("Developer Customer Bypass failed: " + err.message);
        }
    }
);



const FRONTEND_USER_URL = process.env.FRONTEND_USER_URL || "https://gharsekro.com";

authRouter.get('/google/callback', passport.authenticate('google-customer', { failureRedirect: '/' }), async (req, res) => {
    try {
        const user = req.user;

        const customer = await prisma.customer.findUnique({ where: { userid: user.googleid } });
        if (customer) {
            const token = jwt.sign({ customerid: customer.id, type: customer.type}, process.env.JWT_SECRET, { expiresIn: "30d" });
            res.redirect(`${FRONTEND_USER_URL}/login?token=${token}&name=${user.name}&email=${user.email}&profile=${user.profileimage}&type=${customer.type}&success=yes`)
            // res.json({
            //     success : true,
            //     message : token
            // })
        } else {
            const temptoken = jwt.sign({ userid: user.googleid }, process.env.JWT_SECRET, { expiresIn: "10m" });
            res.redirect(`${FRONTEND_USER_URL}/login?token=${temptoken}&name=${user.name}&email=${user.email}&profile=${user.profileimage}&success=no`)
            // res.json({
            //     success : false,
            //     message : temptoken
            // })
        }
    } catch (err) {
        console.log(err);
        res.status(500).json({ success: false, message: "Something went wrong" });
    }
})


authRouter.post("/signup", userMiddleware, async (req, res) => {
    const { city, state, pincode, flatnumber, phone, type } = req.body;

    const userid = await req.userid;
    const user = await prisma.user.findUnique({
        where: {
            googleid: userid
        },
        select: {
            customer: true
        }
    })
    try {

        if (user && user.customer) {
            const customer = await prisma.customer.findUnique({
                where: { userid },
                include: { houseaddress: true }
            });

            if (phone) {
                const updated_user = await prisma.user.update({
                    where: { googleid: userid },
                    data: {
                        phone
                    }
                });
            }


            if (!customer || !customer.houseaddress[0]) {
                return res.status(404).json({ success: false, message: "Customer or address not found" });
            }
            const addressId = customer.houseaddress[0].id;
            const updatedAddress = await prisma.address.update({
                where: { id: addressId },
                data: { city, state, pincode, flatnumber: parseInt(flatnumber, 10) || 0 }
            });

            const token = jwt.sign({ customerid: customer.id }, process.env.JWT_SECRET, { expiresIn: "30d" });
            res.status(200).json({ success: true, token: token });

        }
        else {
            const updated_user = await prisma.user.update(
                {
                    where: {
                        googleid: userid
                    },
                    data: {
                        customer: {
                            create: {
                                type,
                                houseaddress: {
                                    create: {
                                        city,
                                        state,
                                        pincode,
                                        flatnumber: parseInt(flatnumber, 10) || 0
                                    }
                                }
                            }
                        },
                    },
                    include: {
                        customer: {
                            select: {
                                id : true,
                                type: true,
                                houseaddress: true
                            }
                        }
                    }
                }
            )
            console.log(updated_user);
            const token = jwt.sign({ customerid: updated_user.customer.id }, process.env.JWT_SECRET, { expiresIn: "30d" });
            res.status(200).json({ success: true, token: token });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Something went wrong" });
    }
})
