require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const stripe = require('stripe')(process.env.STRIPE_PAYMENT_SECRET);
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const app = express();
const port = process.env.PORT || 5000;

// middleWere
app.use(cors());
app.use(express.json());

// console.log(process.env.STRIPE_PAYMENT_SECRET);

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.ufkobjs.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        // await client.connect();

        const database = client.db("bistroDB");
        const userCollection = database.collection("users");
        const menuCollection = database.collection("menu");
        const reviewsCollection = database.collection("reviews");
        const cartCollection = database.collection("carts");
        const paymentCollection = database.collection("payments");

        // jwt related api
        app.post("/jwt", async (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });
            res.send({ token });
        })

        // Middlewares
        const verifyToken = (req, res, next) => {
            // console.log("inside verify token", req.headers.authorization);

            if (!req.headers.authorization) {
                return res.status(401).send({ message: "Unauthorized access" });
            }

            const token = req.headers.authorization.split(" ")[1]
            jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (error, decoded) => {
                if (error) {
                    return res.status(401).send({ message: "Unauthorized access" });
                }
                req.decoded = decoded;
                next();
            })
        }

        const verifyAdmin = async (req, res, next) => {
            const email = req.decoded.email;
            const query = { email: email };
            const user = await userCollection.findOne(query);
            const isAdmin = user?.role === "admin";
            if (!isAdmin) {
                return res.status(403).send("forbidden access");
            }
            next();
        }

        // Users related api
        app.get("/users", verifyToken, verifyAdmin, async (req, res) => {
            const result = await userCollection.find().toArray();
            res.send(result);
        })

        app.get("/users/admin/:email", verifyToken, async (req, res) => {
            const email = req.params.email;
            if (email !== req.decoded.email) {
                return res.status(403).send("forbidden access");
            }

            const query = { email: email }
            const user = await userCollection.findOne(query);
            let admin = false;
            if (user) {
                admin = user?.role === "admin";
            }
            res.send({ admin });
        })

        app.post("/users", async (req, res) => {
            const user = req.body;
            const query = { email: user.email }
            const existingUser = await userCollection.findOne(query);
            if (existingUser) {
                return res.send({ message: "user already exists", insertrdId: null })
            }
            const result = await userCollection.insertOne(user);
            res.send(result);
        })

        app.patch("/users/admin/:id", verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const updateDoc = {
                $set: {
                    role: "admin"
                }
            }
            const result = await userCollection.updateOne(filter, updateDoc);
            res.send(result);
        })

        app.delete("/users/:id", verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await userCollection.deleteOne(query);
            res.send(result);
        })

        // Menu related api
        app.get("/menu", async (req, res) => {
            const reault = await menuCollection.find().toArray();
            res.send(reault);
        })

        app.get("/menu/:id", async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const reault = await menuCollection.findOne(query);
            res.send(reault);
        })

        app.post("/menu", verifyToken, verifyAdmin, async (req, res) => {
            const data = req.body;
            const result = await menuCollection.insertOne(data);
            res.send(result);
        })

        app.patch("/menu/:id", async (req, res) => {
            const id = req.params.id;
            const item = req.body;
            const query = { _id: new ObjectId(id) };
            const updateDoc = {
                $set: {
                    name: item.name,
                    category: item.category,
                    price: item.price,
                    recipe: item.recipe,
                    image: item.image
                }
            }
            const reault = await menuCollection.updateOne(query, updateDoc);
            res.send(reault);
        })

        app.delete("/menu/:id", verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await menuCollection.deleteOne(query);
            res.send(result);
        })

        app.get("/reviews", async (req, res) => {
            const reault = await reviewsCollection.find().toArray();
            res.send(reault);
        })

        // Carts Collection
        app.get("/carts", async (req, res) => {
            const email = req.query.email;
            const query = { email: email };
            const result = await cartCollection.find(query).toArray();
            res.send(result);
        })

        app.post("/carts", async (req, res) => {
            const cartItem = req.body;
            const result = await cartCollection.insertOne(cartItem);
            res.send(result);
        })

        app.delete("/carts/:id", async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await cartCollection.deleteOne(query);
            res.send(result);
        })

        // Payment intent
        app.post("/create-payment-intent", async (req, res) => {
            const { price } = req.body;
            const amount = parseInt(price * 100);

            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: "usd",
                payment_method_types: ["card"]
            })

            res.send({ clientSecret: paymentIntent.client_secret, })

        })

        app.get("/payments/:email", verifyToken, async (req, res) => {
            const email = req.params.email;
            const query = { email: email };
            if (email !== req.decoded.email) {
                return res.status(403).send({ message: "forbidden access" });
            }
            const result = await paymentCollection.find(query).toArray();
            res.send(result);
        })

        app.post("/payments", async (req, res) => {
            const payment = req.body;
            const paymentResult = await paymentCollection.insertOne(payment);

            // carefully delete each item from the cart
            console.log("payment info", payment);

            const query = {
                _id: {
                    $in: payment.cartIds.map(id => new ObjectId(id))
                }
            }
            const deleteResult = await cartCollection.deleteMany(query);

            res.send({ paymentResult, deleteResult });
        })

        // Stats and Analytics
        app.get("/admin-stats", verifyToken, verifyAdmin, async (req, res) => {
            const users = await userCollection.estimatedDocumentCount();
            const menuItems = await menuCollection.estimatedDocumentCount();
            const orders = await paymentCollection.estimatedDocumentCount();

            // this is not the best way
            // const payments = await paymentCollection.find().toArray();
            // const revenue = payments.reduce((total, payment) => total + payment.price, 0)

            const result = await paymentCollection.aggregate([
                {
                    $group: {
                        _id: null,
                        totalRevenue: { $sum: "$price" }
                    }
                }
            ]).toArray();

            const revenue = result.length > 0 ? result[0].totalRevenue : 0;

            res.send({ users, menuItems, orders, revenue })
        })

        // Using aggregate Popeline
        app.get("/order-state", verifyToken, verifyAdmin, async (req, res) => {
            const result = await paymentCollection.aggregate([
                {
                    $unwind: "$menuItemIds"
                },
                {
                    $lookup: {
                        from: "menu",
                        localField: "menuItemIds",
                        foreignField: "_id",
                        as: "menuItems"
                    }
                },
                {
                    $unwind: "$menuItems"
                },
                {
                    $group: {
                        _id: "$menuItems.category",
                        quantity: { $sum: 1 },
                        revenue: { $sum: "$menuItems.price" }
                    }
                },
                {
                    $project: {
                        _id: 0,
                        category: "$_id",
                        quantity: "$quantity",
                        revenue: "$revenue"
                    }
                }
            ]).toArray();

            res.send(result);
        })


        // Send a ping to confirm a successful connection
        // await client.db("admin").command({ ping: 1 });
        // console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // await client.close();
    }
}
run().catch(console.dir);


app.get("/", (req, res) => {
    res.send("Server is running");
})

app.listen(port, () => {
    console.log(`Server is running on ${port}`);
})