const express = require('express')
const jwt = require('jsonwebtoken');
const app = express();
require('dotenv').config()
const cors = require('cors');
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const port =  process.env.PORT || 5000

app.use(cors({
  origin: "https://bistro-boss-restaurant-4da19.web.app",
  // origin: "http://localhost:5173",
  credentials: true,
}))
app.use(express.json())



const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
// const uri = "mongodb+srv://BistroBoss:<password>@cluster0.gjivdvk.mongodb.net/?retryWrites=true&w=majority";
const uri = `mongodb+srv://BistroBoss:${process.env.PASSWORD}@cluster0.gjivdvk.mongodb.net/?retryWrites=true&w=majority`;

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

const menuCollection = client.db("BistroDB").collection("menu");
const reviewCollection = client.db("BistroDB").collection("reviews");
const cartCollection = client.db("BistroDB").collection("carts");
const userCollection = client.db("BistroDB").collection("users");
const paymentCollection = client.db("BistroDB").collection("payments");



app.post('/jwt',async (req, res) => {

  const user = req.body;
  const token = jwt.sign(user,process.env.ACCESS_TOKEN,{expiresIn:'1h'});
  res.send(token)
})

const verifyToken = (req,res,next)=>{
  // console.log("inside VF",req.headers)
  if (!req.headers.authorization) {
    return res.status(401).send({message: 'Access Denied'})
  }
  const token = req.headers.authorization.split(' ')[1]
  jwt.verify(token,process.env.ACCESS_TOKEN,(err,decoded)=>{
    if (err) {
      return res.status(401).send({message: 'Access Denied'})
    }
    req.decoded = decoded;
    next();
  })
}
const verifyAdmin =async (req,res,next)=>{
const email= req.decoded.email;
const query = {email: email};
const user = await userCollection.findOne(query);
const isAdmin = user?.role ==='admin';
if (!isAdmin) {
  return res.status(401).send({message: 'forbidden access'})
}
next();
}


app.post("/create-payment-intent", async (req, res) => {
  const { price } = req.body;
  const paymentIntent = await stripe.paymentIntents.create({
    amount: parseInt(price*100),
    currency: "usd",
    payment_method_types:['card'],
  });
  res.send({
    clientSecret: paymentIntent.client_secret,
  });
});
app.get('/payments/:email', verifyToken, async (req, res) => {
  const query = { email: req.params.email }
  if (req.params.email !== req.decoded.email) {
    return res.status(403).send({ message: 'forbidden access' });
  }
  const result = await paymentCollection.find(query).toArray();
  res.send(result);
})
app.get('/payments', verifyToken, async (req, res) => {
  
  const result = await paymentCollection.find().toArray();
  res.send(result);
})
// --------------
app.patch('/payments/status/update/:id', verifyToken, async (req, res) => {
  const id=req.params.id;
  const filter = {_id: new ObjectId(id)}
  const updatedDoc = {
    $set:{
      status:'Done'
    }
  }
  const result =  await paymentCollection.updateOne(filter,updatedDoc);
  res.send(result);
})

app.post('/payments', async (req, res) => {
  const payment = req.body;
  const paymentResult = await paymentCollection.insertOne(payment);

  //  carefully delete each item from the cart
  console.log('payment info', payment);
  const query = {
    _id: {
      $in: payment.cartIds.map(id => new ObjectId(id))
    }
  };
  const deleteResult = await cartCollection.deleteMany(query);

  // send user email about payment confirmation
  // mg.messages
  //   .create(process.env.MAIL_SENDING_DOMAIN, {
  //     from: "Mailgun Sandbox <postmaster@sandboxbdfffae822db40f6b0ccc96ae1cb28f3.mailgun.org>",
  //     to: ["mhpiter8@gmail.com"],
  //     subject: "Bistro Boss Order Confirmation",
  //     text: "Testing some Mailgun awesomness!",
  //     html: `
  //       <div>
  //         <h2>Thank you for your order</h2>
  //         <h4>Your Transaction Id: <strong>${payment.transactionId}</strong></h4>
  //         <p>We would like to get your feedback about the food</p>
  //       </div>
  //     `
  //   })
  //   .then(msg => console.log(msg)) // logs response data
  //   .catch(err => console.log(err)); // logs any error`;

  res.send({ paymentResult, deleteResult });
})





app.post('/users',async (req, res) => {
  const user = req.body;
  const query = {email:user.email}
  const existing = await userCollection.findOne(query)
  if (existing) {
    return res.send({message: 'user already exist', insertedId: null})
  }
  const result =await userCollection.insertOne(user);
  res.send(result)
})
app.get('/users',verifyToken,verifyAdmin,async (req, res) => {
  
  const result = await userCollection.find().toArray();
  res.send(result)
})
app.delete('/users/:id',verifyToken,verifyAdmin,async (req,res)=>{
  const id= req.params.id;
  const query ={_id: new ObjectId(id)}
  const result =  await userCollection.deleteOne(query);
  res.send(result)
})
app.patch('/users/admin/:id',verifyToken,verifyAdmin,async (req, res) => {

  const id = req.params.id;
  const filter = {_id: new ObjectId(id)}
  const updatedDoc = {
    $set:{
      role:'admin'
    }
  }
  const result =  await userCollection.updateOne(filter,updatedDoc);
  res.send(result)
})
app.get('/users/admin/:email',verifyToken,async (req,res) => {
  const email = req.params.email;
  if (email!==req.decoded.email){
    return res.status(403).send({message:'Unauthenticated access'})
  }
  const query ={email:email}
  const user = await userCollection.findOne(query)
  let admin = false;
  if (user) {
    admin=user?.role==='admin';
  }
  res.send({admin})
})


app.get('/carts',async (req,res) => {
const email= req.query.email;
const query ={email:email}
  const result =  await cartCollection.find(query).toArray();
  res.send(result)
})

app.post('/carts',async (req,res)=>{
  const cartItem = req.body;
  const result =await cartCollection.insertOne(cartItem);
  res.send(result)
})

app.delete('/carts/:id',async (req,res)=>{
  const id= req.params.id;
  const query ={_id: new ObjectId(id)}
  const result =  await cartCollection.deleteOne(query);
  res.send(result)
})


app.post('/menu',verifyToken,verifyAdmin,async (req,res)=>{
  const item = req.body;
  const result =await menuCollection.insertOne(item);
  res.send(result)
})
app.get('/menu',async (req,res) => {
    const result =  await menuCollection.find().toArray();
    res.send(result)
})
app.get('/menu/:id',async(req,res)=>{
  const id = req.params.id;
// const query = {_id: new ObjectId(id)}
const query = {_id:id}
const result = await menuCollection.findOne(query);
// console.log(result)
res.send(result)
})
app.delete('/menu/:id',verifyToken,verifyAdmin,async (req,res)=>{
  const id= req.params.id;
  // const query ={_id: new ObjectId(id)}
  const query = {_id:id}
  const result =  await menuCollection.deleteOne(query);
  res.send(result)
})
//
app.patch('/menu/:id',verifyToken,verifyAdmin,async (req,res)=>{
  const id= req.params.id;
  const item = req.body;
  // const filter ={_id: new ObjectId(id)}
  const filter = {_id:id}
  const updatedDoc = {
    $set:{
      name:item.name,
      category:item.category,
      price:item.price,
      recipe:item.recipe,
      image:item.image,
    }
  }
  const result =  await menuCollection.updateOne(filter,updatedDoc);
  res.send(result)
})



app.get('/reviews',async (req,res) => {
    const result =  await reviewCollection.find().toArray();
    res.send(result)
})
    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);




app.get('/',(req,res)=>{
    res.send('Bistro Boss is running')
})


app.listen(port,()=>{
    console.log(`BistroBoss is listening on ${port}`)
})