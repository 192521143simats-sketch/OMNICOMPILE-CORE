/* Dependency-aware manufacturing cost pipeline; zero exit is the oracle. */
int material(int units) { return units * (20 + 5); }
int labor(int units) { int total=0; int i=0; while(i<units) { total=total+7; i=i+1; } return total; }
int overhead(int units) { if(units>10) return 30; return 50; }
int quote(int units) { return material(units)+labor(units)+overhead(units); }
int main(void) { if(quote(12)==414) return 0; return 1; }
