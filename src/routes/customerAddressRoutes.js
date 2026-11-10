import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";
import {
  createAddressHandler,
  getAllAddressesHandler,
  getAddressByIdHandler,
  updateAddressHandler,
  setDefaultAddressHandler,
  deleteAddressHandler,
} from "../controllers/addressController.js";

const router = express.Router();

// Enforce JWT authentication and customer role authorization across all address routes
router.use(protect);
router.use(authorizeRoles("customer"));

// Routes for customer delivery address management
router.route("/")
  .post(createAddressHandler)
  .get(getAllAddressesHandler);

router.route("/:id")
  .get(getAddressByIdHandler)
  .put(updateAddressHandler)
  .delete(deleteAddressHandler);

router.patch("/:id/default", setDefaultAddressHandler);

export default router;
