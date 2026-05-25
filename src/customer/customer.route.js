import { Router } from "express"
import {customerInventoryRouter} from './inventory.js'
import { customerOrdersRouter } from "./orders.js"; // import customerOrdersRouter
// import necessary routes
import { authRouter } from "./auth.js";
import { addressRouter } from "./address.js";

export const customerRouter = Router();

customerRouter.use('/auth', authRouter)
customerRouter.use('/address', addressRouter)
customerRouter.use('/inventory', customerInventoryRouter)
customerRouter.use('/orders', customerOrdersRouter) // use customerOrdersRouter


// {
//     "addressId": "21a44070-3ffc-4b88-a5f6-63ee47f02c80",
//     "paymentType": "COD",
//     "items": [
//         {
//             "itemId": "4a50a1e8-9d85-4a39-b1dd-bbdb0075c5cc",
//             "quantity": 1,
//             "variant": {
//                 "size": "1\" INCH",
//                 "price": 124
//             }
//         },
//         {
//             "itemId": "4a50a1e8-9d85-4a39-b1dd-bbdb0075c5cc",
//             "quantity": 1,
//             "variant": {
//                 "size": "1^1/4\" INCH",
//                 "price": 255
//             }
//         }
//     ]
// }
