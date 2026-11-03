"""Trusted controller entry: request transport is never a program-visible secret."""
import os
import sys

stream = open('/work/request.json', 'rb')
os.unlink('/work/request.json')
os.dup2(stream.fileno(), 0)
os.execv(sys.executable, [sys.executable, '-I', '/opt/omnicompile/runner.py'])
