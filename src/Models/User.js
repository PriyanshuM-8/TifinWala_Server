import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
      minlength: [2, "Name must be at least 2 characters long"],
      maxlength: [60, "Name cannot exceed 60 characters"],
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    phone: {
      type: String,
      required: [true, "Phone number is required"],
      unique: true,
      trim: true,
      index: true,
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: [8, "Password must be at least 8 characters long"],
      select: false, // Prevents accidental password leakage in queries
    },
    role: {
      type: String,
      enum: {
        values: ["customer", "chef", "admin"],
        message: "{VALUE} is not a valid user role",
      },
      default: "customer",
    },
    emailVerified: {
      type: Boolean,
      default: false,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform: function (doc, ret) {
        delete ret.password;
        delete ret.__v;
        return ret;
      },
    },
  }
);

// Pre-save hook to hash password if modified and not already hashed
userSchema.pre("save", async function () {
  if (!this.isModified("password")) return;

  // Check if already hashed (bcrypt hashes start with $2a$, $2b$, or $2y$)
  if (/^\$2[aby]\$\d{2}\$[./0-9A-Za-z]{53}$/.test(this.password)) {
    return;
  }

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Compare password instance method
userSchema.methods.comparePassword = async function (candidatePassword) {
  if (!this.password) {
    throw new Error("Password field was not selected in query");
  }
  return bcrypt.compare(candidatePassword, this.password);
};

const User = mongoose.models.User || mongoose.model("User", userSchema);

export default User;
