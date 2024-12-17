const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
require("dotenv").config();

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Connect to MongoDB
mongoose.connect(process.env.mongo_url, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});
const db = mongoose.connection;
db.on("error", console.error.bind(console, "MongoDB connection error:"));
db.once("open", () => {
  console.log("Connected to MongoDB");
});

io.on('connection', (socket) => {
  console.log('A user connected');

  // Set up MongoDB change stream
  const changeStream = User.watch();

  changeStream.on('change', async (change) => {
    if (change.operationType === 'update') {
      try {
        // Fetch the updated user
        const user = await User.findById(change.documentKey._id);
        console.log(user);
  
        if (user && user.leg && user.leg.length > 0) {
          // Fetch details for each leg user by their ID
          const legsDetails = await User.find({
            '_id': { $in: user.leg }
          }).select('username totalPurchases totalProfit');
          console.log(legsDetails);
  
          const emittedUsernames = new Set(); // Set to track emitted usernames
  
          // Emit updated data for each leg, ensuring usernames are distinct
          legsDetails.forEach(leg => {
            if (!emittedUsernames.has(leg.username)) {
              emittedUsernames.add(leg.username);
              const userData = {
                username: user.username,
                legUsername: leg.username,
                purchaseAmount: leg.totalPurchases,
                totalProfit: user.totalProfit
              };
              socket.emit('update', userData);
            }
          });
        } else {
          // If no legs, emit user data without leg details
          const userData = {
            username: user.username,
            legUsername: null,
            purchaseAmount: null,
            totalProfit: user.totalProfit
          };
          socket.emit('update', userData);
        }
      } catch (error) {
        console.error('Error fetching user data:', error);
      }
    }
  });
  
  
  
  

  socket.on('disconnect', () => {
    console.log('User disconnected');
    changeStream.close();
  });
});


// Function to generate a 6-character referral code
function generateReferralCode() {
  const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let referralCode = "";
  for (let i = 0; i < 6; i++) {
    referralCode += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return referralCode;
}

// Define User schema and model
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  referralCode: { type: String, required: true, unique: true },
  referredBy: { type: String, required: false },
  parentId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: false },
  leg: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  totalProfit: { type: Number, default: 0 },
  totalPurchases: { type: Number, default: 0 }
});
const User = mongoose.model("User", userSchema);

// Define Purchase schema and model
const transactionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  amount: { type: Number, required: true },
  createdAt: { type: Date, default: Date.now },
});
const Transaction = mongoose.model("Transaction", transactionSchema);

app.use(express.json()); // For parsing JSON bodies
app.use(express.static("public")); // Serve static files

const JWT_SECRET = process.env.JWT_SECRET || "default_secret";

// Register route
app.post("/register", async (req, res) => {
  const { username, password, referredBy } = req.body;

  try {
    // Check if the username already exists
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(400).json({ success: false, message: "Username already exists" });
    }

    let parentId = null;
    let referringUser = null;

    // Check if the user was referred by someone with a valid referral code
    if (referredBy) {
      referringUser = await User.findOne({ referralCode: referredBy });
      if (!referringUser) {
        return res.status(400).json({ success: false, message: "Invalid referral code" });
      }

      // Check if the referring user has reached the referral limit
      if (referringUser.leg.length >= 8) {
        return res.status(400).json({ success: false, message: "Referral limit reached" });
      }

      parentId = referringUser._id;
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);
    // Generate a unique referral code
    const referralCode = generateReferralCode();

    // Create the new user
    const newUser = new User({
      username,
      password: hashedPassword,
      referralCode,
      referredBy,
      parentId,
    });
    
    // Save the new user
    await newUser.save();

    // If referred, add the new user's ID to the referring user's leg field
    if (referringUser) {
      referringUser.leg.push(newUser._id);
      await referringUser.save();
    }

    // Respond with success
    res.json({ success: true, message: "User registered successfully", referralCode });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error registering user" });
  }
});


// Login route
app.post("/login", async (req, res) => {
  const { username, password } = req.body;

  try {
    const user = await User.findOne({ username });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }

    const token = jwt.sign({ id: user._id, username: user.username }, JWT_SECRET, {
      expiresIn: "1h",
    });

    res.json({ success: true, token, referralCode: user.referralCode });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error logging in" });
  }
});

// Middleware to authenticate JWT
function authenticateToken(req, res, next) {
  const token = req.headers["authorization"]?.split(" ")[1];
  if (!token) return res.status(401).json({ success: false, message: "Access token required" });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ success: false, message: "Invalid token" });
    req.user = user;
    next();
  });
}

// Buy route
app.post("/buy", authenticateToken, async (req, res) => {
  const { amount } = req.body;
  const userId = req.user.id;

  try {
    // Record transaction
    const transaction = new Transaction({ userId, amount });
    await transaction.save();

    const user = await User.findById(userId);
    user.totalPurchases += amount; // Add purchase amount to total
    await user.save();

    // Update user profits in the hierarchy only if the purchase amount is greater than 1000
    if (amount > 1000) {
      const user = await User.findById(userId);
      if (user && user.parentId) {
        // 5% profit for direct parent
        const parent = await User.findById(user.parentId);
        if (parent) {
          parent.totalProfit += amount * 0.05;
          await parent.save();

          // 1% profit for grandparent, if applicable
          if (parent.parentId) {
            const grandParent = await User.findById(parent.parentId);
            if (grandParent) {
              grandParent.totalProfit += amount * 0.01;
              await grandParent.save();
            }
          }
        }
      }
    }

    io.emit("purchaseMade", { username: user.username, amount });
    res.json({ success: true, message: "Purchase successful!", transaction });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error processing purchase" });
  }
});


const PORT = 3000;
server.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
