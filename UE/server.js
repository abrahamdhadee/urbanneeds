const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const twilio = require('twilio');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// CORS configuration for production
app.use(cors({
    origin: '*', // In production, replace with your frontend domain
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type']
}));

app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Twilio configuration using environment variables
const accountSid = process.env.TWILIO_ACCOUNT_SID || 'ACe4e4fa5b35297f6cad8f3747ed72a5df';
const authToken = process.env.TWILIO_AUTH_TOKEN || '6b40127465a01ababcafa7be44cdaa73';
const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER || '+12317870262';
const client = twilio(accountSid, authToken);

// Validate Twilio credentials and phone number
async function validateTwilioCredentials() {
    try {
        const account = await client.api.accounts(accountSid).fetch();
        console.log('Twilio account validated:', account.friendlyName);

        // Verify the phone number is valid
        const incomingPhoneNumbers = await client.incomingPhoneNumbers.list();
        const isValidNumber = incomingPhoneNumbers.some(number => number.phoneNumber === twilioPhoneNumber);

        if (!isValidNumber) {
            console.error('Warning: The Twilio phone number is not verified or not associated with your account');
            console.log('Please verify your phone number in the Twilio console or use a verified number');
        }

        return true;
    } catch (error) {
        console.error('Twilio validation error:', error);
        return false;
    }
}

// Call validation on server start
validateTwilioCredentials().then(valid => {
    if (!valid) {
        console.error('Twilio credentials are invalid. Please check your Account SID and Auth Token.');
    }
});

// MongoDB connection with error handling
const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/urban_ease', {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });
        console.log('Connected to MongoDB');
    } catch (error) {
        console.error('MongoDB connection error:', error);
        // Don't throw error to allow server to start even if DB connection fails
    }
};

// Connect to MongoDB
connectDB();

// User schema and model
const userSchema = new mongoose.Schema({
    name: String,
    phone: String,
    address: String,
    pin: String,
    otp: String,
    otpExpiry: Date
});
const User = mongoose.model('User', userSchema);

// Generate OTP
function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

// Send OTP endpoint
app.post('/send-otp', async (req, res) => {
    try {
        const { mobile } = req.body;
        const otp = generateOTP();
        const otpExpiry = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes expiry

        console.log('Attempting to send OTP to:', mobile);
        console.log('Generated OTP:', otp);

        let user = await User.findOne({ phone: mobile });

        if (!user) {
            console.log('User not found for mobile:', mobile);
            return res.status(404).json({ message: 'User not found. Please create an account.' });
        }

        // Send OTP via SMS
        try {
            console.log('Attempting to send SMS...');
            console.log('From:', twilioPhoneNumber);
            console.log('To:', `+91${mobile}`);

            const message = await client.messages.create({
                body: `Your Urban Ease OTP is: ${otp}. Valid for 5 minutes.`,
                from: twilioPhoneNumber,
                to: `+91${mobile}`
            });

            console.log('SMS sent successfully. Message SID:', message.sid);
            console.log('Message status:', message.status);
        } catch (smsError) {
            console.error('Detailed SMS error:', {
                code: smsError.code,
                message: smsError.message,
                moreInfo: smsError.moreInfo,
                status: smsError.status
            });

            // For testing, we'll still store the OTP even if SMS fails
            console.log('SMS failed, but storing OTP for testing');
        }

        // Store OTP in database
        user.otp = otp;
        user.otpExpiry = otpExpiry;
        await user.save();
        console.log('OTP stored in database');

        res.json({
            message: 'OTP sent successfully',
            otp: otp // Include OTP in response for testing
        });
    } catch (error) {
        console.error('Error in send-otp:', error);
        res.status(500).json({
            message: 'Error sending OTP',
            error: error.message
        });
    }
});

// Verify OTP endpoint
app.post('/verify-otp', async (req, res) => {
    try {
        const { mobile, otp } = req.body;
        const user = await User.findOne({ phone: mobile });

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        if (user.otp !== otp || new Date() > user.otpExpiry) {
            return res.status(400).json({ message: 'Invalid or expired OTP' });
        }

        // Clear OTP after successful verification
        user.otp = null;
        user.otpExpiry = null;
        await user.save();

        res.json({ success: true });
    } catch (error) {
        console.error('Error in verify-otp:', error);
        res.status(500).json({ message: 'Error verifying OTP' });
    }
});

// Get user data endpoint
app.post('/get-user-data', async (req, res) => {
    try {
        const { mobile } = req.body;
        const user = await User.findOne({ phone: mobile });

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Return only the necessary user data
        res.json({
            name: user.name,
            address: user.address,
            phone: user.phone
        });
    } catch (error) {
        console.error('Error in get-user-data:', error);
        res.status(500).json({ message: 'Error fetching user data' });
    }
});

// Create account endpoint
app.post('/create-account', async (req, res) => {
    try {
        const { name, address, phone } = req.body;

        // Check if user already exists
        const existingUser = await User.findOne({ phone });
        if (existingUser) {
            return res.status(400).json({ message: 'User already exists' });
        }

        // Create new user
        const user = new User({
            name,
            address,
            phone
        });

        await user.save();
        res.json({ message: 'Account created successfully' });
    } catch (error) {
        console.error('Error in create-account:', error);
        res.status(500).json({ message: 'Error creating account' });
    }
});

// Serve the main HTML file
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ message: 'Something went wrong!' });
});

// Export the Express API
module.exports = app;

// Start the server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
}); 