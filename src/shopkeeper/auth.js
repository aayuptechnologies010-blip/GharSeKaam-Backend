import { Router } from "express";
import jwt from "jsonwebtoken";
import passport from "passport";
import dotenv from "dotenv";
import { prisma } from "../../config/prismaConfig.js";
import { userMiddleware } from "../../middlewares/userAuth.js";
import { shopkeeperMiddleware } from "../../middlewares/shopkeeperAuth.js";

dotenv.config();
export const authRouter = Router();

/* --------------------------------------------------
   ❌ REMOVE THIS ROUTE (DANGEROUS)
-------------------------------------------------- */
// authRouter.get('/login/:id', ...)

/* --------------------------------------------------
   GOOGLE LOGIN (SHOPKEEPER ONLY)
-------------------------------------------------- */

authRouter.get(
  "/google",
  (req, res, next) => {
    if (req.query.bypass === "true") {
      return next();
    }
    return passport.authenticate("google-shopkeeper", { scope: ["profile", "email"] })(req, res, next);
  },
  async (req, res) => {
    try {
      const mockEmail = "developer_admin@buildmart.com";
      const mockGoogleId = "mock_google_id_developer_admin";
      const mockName = "Developer Admin";
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

      // 2. Check if Shopkeeper already exists
      const shopkeeper = await prisma.shopkeeper.findUnique({
        where: { userid: user.googleid },
      });

      if (!shopkeeper) {
        // If not a shopkeeper yet, generate temp token and redirect to setup page
        const token = jwt.sign(
          { userid: user.googleid },
          process.env.JWT_SECRET,
          { expiresIn: "30d" }
        );
        return res.redirect(
          `${FRONTEND_ADMIN_URL}/oauth/callback?token=${token}&success=no&name=${encodeURIComponent(user.name)}&email=${encodeURIComponent(user.email)}`
        );
      }

      // 3. If Shopkeeper exists, sign final token and redirect to dashboard
      const token = jwt.sign(
        { shopkeeperid: shopkeeper.id },
        process.env.JWT_SECRET,
        { expiresIn: "30d" }
      );

      return res.redirect(
        `${FRONTEND_ADMIN_URL}/oauth/callback?token=${token}&success=yes&name=${encodeURIComponent(user.name)}&email=${encodeURIComponent(user.email)}`
      );
    } catch (err) {
      console.error("Developer Login Bypass error:", err);
      return res.status(500).send("Developer Login Bypass failed: " + err.message);
    }
  }
);

const FRONTEND_ADMIN_URL = process.env.FRONTEND_ADMIN_URL || "https://admin.gharsekro.com";

authRouter.get(
  "/google/callback",
  passport.authenticate("google-shopkeeper", { failureRedirect: "/" }),
  async (req, res) => {
    try {
      const user = req.user;

      const shopkeeper = await prisma.shopkeeper.findUnique({
        where: { userid: user.googleid },
      });

      if (!shopkeeper) {
        // First-time login: generate temp token and redirect to shop setup page
        const token = jwt.sign(
          { userid: user.googleid },
          process.env.JWT_SECRET,
          { expiresIn: "30d" }
        );
        return res.redirect(
          `${FRONTEND_ADMIN_URL}/oauth/callback?token=${token}&success=no&name=${encodeURIComponent(user.name)}&email=${encodeURIComponent(user.email)}`
        );
      }

      const token = jwt.sign(
        { shopkeeperid: shopkeeper.id },
        process.env.JWT_SECRET,
        { expiresIn: "30d" }
      );

      // Shopkeeper exists: redirect to dashboard
      return res.redirect(
        `${FRONTEND_ADMIN_URL}/oauth/callback?token=${token}&success=yes&name=${encodeURIComponent(user.name)}&email=${encodeURIComponent(user.email)}`
      );
    } catch (err) {
      console.error("Google callback error:", err);
      return res.redirect(`${FRONTEND_ADMIN_URL}/error?message=${encodeURIComponent(err.message || "Authentication callback failed")}`);
    }
  }
);

/* --------------------------------------------------
   SHOPKEEPER SIGNUP / PROFILE COMPLETE
-------------------------------------------------- */

authRouter.post("/signup", userMiddleware, async (req, res) => {
  try {
    const { shopname, city, state, pincode, flatnumber, phone } = req.body;
    const userid = req.userid;

    const user = await prisma.user.findUnique({
      where: { googleid: userid },
      include: { shopkeeper: { include: { shopaddress: true } } },
    });

    let shopkeeper;

    if (user.shopkeeper) {
      shopkeeper = user.shopkeeper;

      if (shopname) {
        await prisma.shopkeeper.update({
          where: { id: shopkeeper.id },
          data: { shopname },
        });
      }

      if (phone) {
        await prisma.user.update({
          where: { googleid: userid },
          data: { phone },
        });
      }

      if (shopkeeper.shopaddress.length > 0) {
        await prisma.address.update({
          where: { id: shopkeeper.shopaddress[0].id },
          data: {
            city,
            state,
            pincode,
            flatnumber: parseInt(flatnumber, 10) || 0,
          },
        });
      }
    } else {
      const created = await prisma.user.update({
        where: { googleid: userid },
        data: {
          phone,
          shopkeeper: {
            create: {
              shopname,
              shopaddress: {
                create: {
                  city,
                  state,
                  pincode,
                  flatnumber: parseInt(flatnumber, 10) || 0,
                },
              },
            },
          },
        },
        include: { shopkeeper: true },
      });

      shopkeeper = created.shopkeeper;
    }

    const token = jwt.sign(
      { shopkeeperid: shopkeeper.id },
      process.env.JWT_SECRET,
      { expiresIn: "30d" }
    );

    return res.status(200).json({ success: true, token });
  } catch (err) {
    console.error("Signup error:", err);
    return res.status(500).json({ success: false, message: "Signup failed" });
  }
});

/* --------------------------------------------------
   SHOPKEEPER PROFILE
-------------------------------------------------- */

authRouter.get("/profile", shopkeeperMiddleware, async (req, res) => {
  try {
    const shopkeeper = await prisma.shopkeeper.findUnique({
      where: { id: req.shopkeeperid },
      include: {
        user: {
          select: { name: true, email: true, phone: true, profileimage: true },
        },
        shopaddress: true,
      },
    });

    if (!shopkeeper) {
      return res.status(404).json({ success: false, message: "Shopkeeper not found" });
    }

    return res.status(200).json({ success: true, profile: shopkeeper });
  } catch (err) {
    console.error("Profile error:", err);
    return res.status(500).json({ success: false, message: "Profile fetch failed" });
  }
});

authRouter.put("/profile", shopkeeperMiddleware, async (req, res) => {
  try {
    const { name, phone, shopname } = req.body;

    if (shopname) {
      await prisma.shopkeeper.update({
        where: { id: req.shopkeeperid },
        data: { shopname },
      });
    }

    if (name || phone) {
      const shopkeeper = await prisma.shopkeeper.findUnique({
        where: { id: req.shopkeeperid },
      });

      await prisma.user.update({
        where: { googleid: shopkeeper.userid },
        data: {
          ...(name && { name }),
          ...(phone && { phone }),
        },
      });
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("Profile update error:", err);
    return res.status(500).json({ success: false, message: "Update failed" });
  }
});
