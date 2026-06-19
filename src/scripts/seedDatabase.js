import "dotenv/config"
import mongoose from "mongoose"
import User from "../models/User.js"
import Auction from "../models/Auction.js"
import connectDB from "../config/database.js"
import bcryptjs from "bcryptjs"

const seedDatabase = async () => {
  try {
    await connectDB()
    console.log("Connected to database")

    await User.deleteMany({})
    await Auction.deleteMany({})
    console.log("Cleared existing data")

    const user1 = await User.create({
      username: "collector_john",
      email: "john@example.com",
      password: await bcryptjs.hash("password123", 10),
      name: "John Collector",
      rating: 4.8,
    })

    const user2 = await User.create({
      username: "seller_jane",
      email: "jane@example.com",
      password: await bcryptjs.hash("password123", 10),
      name: "Jane Seller",
      rating: 4.9,
    })

    const user3 = await User.create({
      username: "bidder_bob",
      email: "bob@example.com",
      password: await bcryptjs.hash("password123", 10),
      name: "Bob Bidder",
      rating: 4.5,
    })

    console.log("Created test users")

    const now = new Date()
    const auctions = await Auction.create([
      {
        title: "Vintage Camera Collection",
        description: "Beautiful collection of vintage film cameras from the 1960s-1980s.",
        startingPrice: 100,
        currentPrice: 450,
        category: "electronics",
        condition: "good",
        seller: user2._id,
        startTime: new Date(now.getTime() - 24 * 60 * 60 * 1000),
        endTime: new Date(now.getTime() + 48 * 60 * 60 * 1000),
        status: "active",
        bidCount: 12,
        images: ["https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?w=500"],
        minBidIncrement: 10,
      },
      {
        title: "Antique Pocket Watch",
        description: "Rare Swiss pocket watch from 1920. Gold plated case, working movement.",
        startingPrice: 50,
        currentPrice: 320,
        category: "collectibles",
        condition: "like_new",
        seller: user2._id,
        startTime: new Date(now.getTime() - 12 * 60 * 60 * 1000),
        endTime: new Date(now.getTime() + 24 * 60 * 60 * 1000),
        status: "active",
        bidCount: 8,
        images: ["https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=500"],
        minBidIncrement: 5,
      },
      {
        title: "Rare First Edition Books Bundle",
        description: "Collection of 15 rare first edition books. Includes works by Tolkien, Asimov, and Clarke.",
        startingPrice: 200,
        currentPrice: 275,
        category: "collectibles",
        condition: "good",
        seller: user1._id,
        startTime: new Date(now.getTime() - 6 * 60 * 60 * 1000),
        endTime: new Date(now.getTime() + 72 * 60 * 60 * 1000),
        status: "active",
        bidCount: 15,
        images: ["https://images.unsplash.com/photo-1507842217343-583f20270319?w=500"],
        minBidIncrement: 15,
      },
      {
        title: "Vintage Vinyl Records Collection",
        description: "Excellent collection of 50+ vinyl records from 1970s-1980s. Classic rock, jazz, and funk.",
        startingPrice: 75,
        currentPrice: 189,
        category: "collectibles",
        condition: "fair",
        seller: user2._id,
        startTime: new Date(now.getTime() - 3 * 60 * 60 * 1000),
        endTime: new Date(now.getTime() + 12 * 60 * 60 * 1000),
        status: "active",
        bidCount: 5,
        images: ["https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=500"],
        minBidIncrement: 5,
      },
      {
        title: "Designer Leather Handbag",
        description: "Authentic designer handbag from 2022. Genuine leather, excellent condition.",
        startingPrice: 150,
        currentPrice: 550,
        category: "fashion",
        condition: "like_new",
        seller: user1._id,
        startTime: new Date(now.getTime() - 18 * 60 * 60 * 1000),
        endTime: new Date(now.getTime() + 36 * 60 * 60 * 1000),
        status: "active",
        bidCount: 22,
        images: ["https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=500"],
        minBidIncrement: 20,
      },
      {
        title: "Retro Gaming Console Bundle",
        description: "Complete retro gaming console collection including NES, SNES, Genesis, and Atari.",
        startingPrice: 200,
        currentPrice: 380,
        category: "electronics",
        condition: "good",
        seller: user2._id,
        startTime: new Date(now.getTime() - 42 * 60 * 60 * 1000),
        endTime: new Date(now.getTime() + 60 * 60 * 60 * 1000),
        status: "active",
        bidCount: 18,
        images: ["https://images.unsplash.com/photo-1606664515524-2b966e4de676?w=500"],
        minBidIncrement: 10,
      },
      {
        title: "Limited Edition Sneakers",
        description: "Rare limited edition sneakers from 2020. Only 500 pairs produced. Size 10.5, unworn.",
        startingPrice: 100,
        currentPrice: 220,
        category: "fashion",
        condition: "new",
        seller: user3._id,
        startTime: new Date(now.getTime() - 10 * 60 * 60 * 1000),
        endTime: new Date(now.getTime() + 18 * 60 * 60 * 1000),
        status: "active",
        bidCount: 31,
        images: ["https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=500"],
        minBidIncrement: 5,
      },
      {
        title: "Art Deco Porcelain Vase",
        description: "Beautiful Art Deco period vase from 1930s. Hand-painted porcelain with gold detailing.",
        startingPrice: 80,
        currentPrice: 180,
        category: "art",
        condition: "like_new",
        seller: user1._id,
        startTime: new Date(now.getTime() - 4 * 60 * 60 * 1000),
        endTime: new Date(now.getTime() + 6 * 60 * 60 * 1000),
        status: "active",
        bidCount: 7,
        images: ["https://images.unsplash.com/photo-1578500494198-246f612d03b3?w=500"],
        minBidIncrement: 5,
      },
    ])

    console.log("Created test auctions:", auctions.length)
    console.log("\nSeed data created successfully!")
    console.log("\nTest Users:")
    console.log("  john@example.com / password123")
    console.log("  jane@example.com / password123")
    console.log("  bob@example.com / password123")

    process.exit(0)
  } catch (error) {
    console.error("Error seeding database:", error)
    process.exit(1)
  }
}

seedDatabase()
