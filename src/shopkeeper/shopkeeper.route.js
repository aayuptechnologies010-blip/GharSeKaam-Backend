import { Router } from "express"

// import necessary routes
import { authRouter } from "./auth.js";
import { inventoryRouter } from "./inventory.js";
import { shopkeeperOrdersRouter } from "./orders.js";
import { dashboardRouter } from "./dashboard.js";
import { customersRouter } from "./customers.js";
import { shopkeeperLabourRouter } from "./labour.js";

export const shopkeeperRouter = Router();

shopkeeperRouter.use('/auth', authRouter)
shopkeeperRouter.use('/inventory', inventoryRouter)
shopkeeperRouter.use('/orders', shopkeeperOrdersRouter)
shopkeeperRouter.use('/dashboard', dashboardRouter)
shopkeeperRouter.use('/customers', customersRouter)
shopkeeperRouter.use('/labour', shopkeeperLabourRouter)