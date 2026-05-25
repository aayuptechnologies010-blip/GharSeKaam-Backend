import { Router } from "express";
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

authRouter.get('/google', async (req, res) => {
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
});



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
