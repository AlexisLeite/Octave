format long

hs = [1e-2, 1e-3, 1e-4];
e_real = exp(1);

for h = hs
    p0 = (1 + h)^(1/h);
    p1 = 2*(1 + h/2)^(2/h) - p0;

    error0 = abs(e_real - p0);
    error1 = abs(e_real - p1);

    printf("h = %e\n", h);
    printf("p0 = %.12f, error = %e\n", p0, error0);
    printf("p1 = %.12f, error = %e\n\n", p1, error1);
end
