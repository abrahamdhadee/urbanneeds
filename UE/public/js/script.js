document.getElementById('loginForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    const phone = document.getElementById('mobile').value;
    const pin = document.getElementById('pin').value;

    // Validate mobile number (basic validation)
    if (!/^\d{10}$/.test(phone)) {
        alert('Please enter a valid 10-digit mobile number');
        return;
    }

    // Validate PIN (must be exactly 4 digits)
    if (!/^\d{4}$/.test(pin)) {
        alert('Please enter a valid 4-digit PIN');
        return;
    }

    const res = await fetch('http://localhost:3000/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, pin })
    });
    const data = await res.json();
    if (data.success) {
        alert('Login successful!');
        this.reset();
        // You can redirect to a dashboard or protected page here
    } else {
        alert('Invalid credentials. Redirecting to Create Account page.');
        window.location.href = 'create-account.html';
    }
});

document.getElementById('createAccountForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    const name = document.getElementById('name').value;
    const phone = document.getElementById('phone').value;
    const address = document.getElementById('address').value;

    const res = await fetch('http://localhost:3000/api/create-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, phone, address })
    });
    const data = await res.json();
    if (data.success) {
        alert('Account created!');
        this.reset();
    } else {
        alert('Error: ' + data.message);
    }
}); 